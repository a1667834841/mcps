#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfig } from './config/index.js';
import { createProvider } from './providers/index.js';
import { SSHConnectionManager, viewLog, searchLog, listLogFiles, getLatestLogFile } from './ssh/index.js';
import type { ServerInfoProvider } from './providers/index.js';

// 加载配置
let provider: ServerInfoProvider;
let connectionManager: SSHConnectionManager;

try {
  const config = loadConfig();
  provider = createProvider(config);
  connectionManager = new SSHConnectionManager();
} catch (err) {
  console.error(`[ssh-log] 启动失败: ${(err as Error).message}`);
  process.exit(1);
}

// 创建 MCP 服务器
const server = new McpServer({
  name: 'ssh-log',
  version: '1.0.0',
});

// Tool 1: list_servers
server.tool(
  'list_servers',
  '列出所有配置的服务器及其服务列表',
  {},
  async () => {
    const servers = provider.listServers();
    return {
      content: [{ type: 'text', text: JSON.stringify(servers, null, 2) }],
    };
  }
);

// Tool 2: list_logs
server.tool(
  'list_logs',
  '列出日志目录配置，支持按服务器或服务名过滤',
  {
    server_id: z.string().optional().describe('按服务器 ID 过滤'),
    service: z.string().optional().describe('按服务名过滤'),
  },
  async ({ server_id, service }) => {
    const logs = provider.listLogs(server_id, service);
    return {
      content: [{ type: 'text', text: JSON.stringify(logs, null, 2) }],
    };
  }
);

// Tool 3: list_log_files
server.tool(
  'list_log_files',
  '列出指定日志目录中的文件列表（按修改时间倒序）',
  {
    server_id: z.string().describe('服务器 ID'),
    log_path: z.string().describe('日志目录路径（配置中的 path）'),
  },
  async ({ server_id, log_path }) => {
    const logConfig = provider.getLogConfig(server_id, log_path);
    if (!logConfig) {
      return {
        content: [{ type: 'text', text: `错误: 未找到服务器 "${server_id}" 中路径为 "${log_path}" 的日志配置` }],
        isError: true,
      };
    }

    try {
      const files = await listLogFiles(connectionManager, logConfig.server, log_path);
      return {
        content: [{
          type: 'text',
          text: `${logConfig.log.name} (${logConfig.log.service})\n目录: ${log_path}\n文件数: ${files.length}\n${'─'.repeat(60)}\n${JSON.stringify(files, null, 2)}`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `错误: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 4: view_log
server.tool(
  'view_log',
  '查看日志内容（支持 tail 和 head 模式）。不指定 file_name 时自动读取目录中最新的文件',
  {
    server_id: z.string().describe('服务器 ID'),
    log_path: z.string().describe('日志目录路径（配置中的 path）'),
    file_name: z.string().optional().describe('日志文件名（可选，不传则自动选最新文件）'),
    mode: z.enum(['head', 'tail']).default('tail').describe('查看模式：head（开头）或 tail（末尾）'),
    lines: z.number().int().min(1).max(1000).default(100).describe('查看行数（1-1000）'),
  },
  async ({ server_id, log_path, file_name, mode, lines }) => {
    const logConfig = provider.getLogConfig(server_id, log_path);
    if (!logConfig) {
      return {
        content: [{ type: 'text', text: `错误: 未找到服务器 "${server_id}" 中路径为 "${log_path}" 的日志配置` }],
        isError: true,
      };
    }

    try {
      // 如果没有指定文件名，获取最新文件
      let targetFile = file_name;
      if (!targetFile) {
        targetFile = await getLatestLogFile(connectionManager, logConfig.server, log_path) ?? undefined;
        if (!targetFile) {
          return {
            content: [{ type: 'text', text: `错误: 目录 "${log_path}" 中没有找到日志文件` }],
            isError: true,
          };
        }
      }

      const filePath = `${log_path}/${targetFile}`;
      const content = await viewLog(connectionManager, logConfig.server, filePath, mode, lines);
      return {
        content: [{
          type: 'text',
          text: `${logConfig.log.name} (${logConfig.log.service}) - ${mode} ${lines} lines\n服务器: ${logConfig.server.name} (${logConfig.server.host})\n文件: ${filePath}\n${'─'.repeat(60)}\n${content}`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `错误: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 5: search_log
server.tool(
  'search_log',
  '搜索日志内容，返回匹配行及前后上下文。不指定 file_name 时搜索目录中最新的文件',
  {
    server_id: z.string().describe('服务器 ID'),
    log_path: z.string().describe('日志目录路径（配置中的 path）'),
    file_name: z.string().optional().describe('日志文件名（可选，不传则搜索最新文件）'),
    pattern: z.string().min(1).describe('搜索关键字或正则表达式'),
    context_lines: z.number().int().min(0).max(20).default(5).describe('显示匹配行前后各 N 行上下文（0-20）'),
    max_results: z.number().int().min(1).max(200).default(50).describe('最大匹配结果数（1-200）'),
    case_sensitive: z.boolean().default(true).describe('是否区分大小写'),
  },
  async ({ server_id, log_path, file_name, pattern, context_lines, max_results, case_sensitive }) => {
    const logConfig = provider.getLogConfig(server_id, log_path);
    if (!logConfig) {
      return {
        content: [{ type: 'text', text: `错误: 未找到服务器 "${server_id}" 中路径为 "${log_path}" 的日志配置` }],
        isError: true,
      };
    }

    try {
      let targetFile = file_name;
      if (!targetFile) {
        targetFile = await getLatestLogFile(connectionManager, logConfig.server, log_path) ?? undefined;
        if (!targetFile) {
          return {
            content: [{ type: 'text', text: `错误: 目录 "${log_path}" 中没有找到日志文件` }],
            isError: true,
          };
        }
      }

      const filePath = `${log_path}/${targetFile}`;
      const { output, matchCount } = await searchLog(
        connectionManager,
        logConfig.server,
        filePath,
        pattern,
        context_lines,
        max_results,
        case_sensitive
      );

      if (!output.trim()) {
        return {
          content: [{
            type: 'text',
            text: `在 ${logConfig.log.name} (${targetFile}) 中未找到匹配 "${pattern}" 的内容`,
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: `${logConfig.log.name} (${logConfig.log.service}) - 搜索: "${pattern}"\n服务器: ${logConfig.server.name} (${logConfig.server.host})\n文件: ${filePath}\n匹配数: ${matchCount} | 上下文: 前后各 ${context_lines} 行 | 大小写${case_sensitive ? '敏感' : '不敏感'}\n${'─'.repeat(60)}\n${output}`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `错误: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// 优雅关闭
process.on('SIGINT', () => {
  connectionManager.closeAll();
  process.exit(0);
});

process.on('SIGTERM', () => {
  connectionManager.closeAll();
  process.exit(0);
});

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(`[ssh-log] 服务器错误: ${err.message}`);
  connectionManager.closeAll();
  process.exit(1);
});
