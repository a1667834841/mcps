import type { ServerConfig, LogFileInfo } from '../types/index.js';
import { SSHConnectionManager } from './connection-manager.js';

/**
 * 对 shell 特殊字符进行转义，防止命令注入
 */
export function escapeShellArg(arg: string): string {
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

/**
 * 列出日志目录中的文件（按修改时间倒序）
 */
export async function listLogFiles(
  manager: SSHConnectionManager,
  serverConfig: ServerConfig,
  dirPath: string
): Promise<LogFileInfo[]> {
  const command = `ls -lt --time-style='+%Y-%m-%d %H:%M:%S' ${escapeShellArg(dirPath)} | grep '^-'`;
  const output = await manager.executeCommand(serverConfig, command);

  if (!output.trim()) return [];

  const files: LogFileInfo[] = [];
  for (const line of output.trim().split('\n')) {
    // 格式: -rw-r--r--. 1 root root 4068282 2026-05-15 13:22:30 output-2026-05-15-0.log
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 8) {
      const size = parts[4];
      const date = parts[5];
      const time = parts[6];
      const fileName = parts.slice(7).join(' ');
      files.push({
        fileName,
        size: formatFileSize(parseInt(size, 10)),
        modifiedTime: `${date} ${time}`,
      });
    }
  }

  return files;
}

/**
 * 获取目录中最新的日志文件名
 */
export async function getLatestLogFile(
  manager: SSHConnectionManager,
  serverConfig: ServerConfig,
  dirPath: string
): Promise<string | null> {
  const command = `ls -t ${escapeShellArg(dirPath)} | head -n 1`;
  const output = await manager.executeCommand(serverConfig, command);
  const fileName = output.trim();
  return fileName || null;
}

/**
 * 查看日志内容（tail 或 head）
 * @param filePath 完整文件路径（目录 + 文件名）
 */
export async function viewLog(
  manager: SSHConnectionManager,
  serverConfig: ServerConfig,
  filePath: string,
  mode: 'head' | 'tail',
  lines: number
): Promise<string> {
  const command = mode === 'tail'
    ? `tail -n ${lines} ${escapeShellArg(filePath)}`
    : `head -n ${lines} ${escapeShellArg(filePath)}`;

  return manager.executeCommand(serverConfig, command);
}

/**
 * 搜索日志内容（grep with context）
 * @param filePath 完整文件路径（目录 + 文件名）
 */
export async function searchLog(
  manager: SSHConnectionManager,
  serverConfig: ServerConfig,
  filePath: string,
  pattern: string,
  contextLines: number,
  maxResults: number,
  caseSensitive: boolean
): Promise<{ output: string; matchCount: number }> {
  const flags: string[] = ['-n'];
  if (!caseSensitive) {
    flags.push('-i');
  }
  if (contextLines > 0) {
    flags.push(`-C ${contextLines}`);
  }

  const command = `grep ${flags.join(' ')} ${escapeShellArg(pattern)} ${escapeShellArg(filePath)} | head -n ${maxResults * (contextLines * 2 + 2)}`;

  const output = await manager.executeCommand(serverConfig, command);

  const matchCount = output
    ? output.split('\n').filter((line) => line.match(/^\d+[-:]/) && !line.startsWith('--')).length
    : 0;

  return { output: output.replace(/\r\n/g, '\n'), matchCount };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}
