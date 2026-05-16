/**
 * 集成测试 - 连接真实服务器测试 5 个 MCP 工具
 *
 * 运行前请准备：
 *   1) 拷贝 config.example.yaml 为 config.yaml 并填好真实服务器信息
 *   2) 通过环境变量指定测试目标：
 *      - TEST_SERVER_ID  ：config.yaml 中的 server id（默认: test-server）
 *      - TEST_LOG_DIR    ：服务器上的日志目录（默认: /var/log）
 */
import { loadConfig } from '../src/config/index.js';
import { createProvider } from '../src/providers/index.js';
import { SSHConnectionManager, viewLog, searchLog, listLogFiles, getLatestLogFile } from '../src/ssh/index.js';

const TEST_SERVER_ID = process.env.TEST_SERVER_ID ?? 'test-server';
const LOG_DIR = process.env.TEST_LOG_DIR ?? '/var/log';

async function runIntegrationTest() {
  console.log('=== SSH Log MCP 集成测试 ===\n');

  // 1. 加载配置
  console.log('【1】加载配置...');
  const config = loadConfig();
  const provider = createProvider(config);
  const connectionManager = new SSHConnectionManager();
  console.log('✓ 配置加载成功\n');

  // 2. list_servers
  console.log('【2】测试 list_servers...');
  const servers = provider.listServers();
  console.log(JSON.stringify(servers, null, 2));
  console.log(`✓ 共 ${servers.length} 个服务器\n`);

  // 3. list_logs
  console.log('【3】测试 list_logs...');
  const logs = provider.listLogs();
  console.log(JSON.stringify(logs, null, 2));
  console.log(`✓ 共 ${logs.length} 个日志目录\n`);

  const serverConfig = provider.getServerConfig(TEST_SERVER_ID);
  if (!serverConfig) {
    console.error(`✗ 未找到服务器配置: ${TEST_SERVER_ID}`);
    process.exit(1);
  }

  // 4. list_log_files
  console.log('【4】测试 list_log_files...');
  try {
    const files = await listLogFiles(connectionManager, serverConfig, LOG_DIR);
    console.log(`目录 ${LOG_DIR} 中共有 ${files.length} 个文件`);
    console.log('最新 5 个文件:');
    files.slice(0, 5).forEach((f) => console.log(`  ${f.fileName} (${f.size}, ${f.modifiedTime})`));
    console.log('✓ list_log_files 成功\n');
  } catch (err) {
    console.error(`✗ list_log_files 失败: ${(err as Error).message}\n`);
  }

  // 5. getLatestLogFile
  console.log('【5】测试 getLatestLogFile...');
  let latestFile: string | null = null;
  try {
    latestFile = await getLatestLogFile(connectionManager, serverConfig, LOG_DIR);
    console.log(`最新文件: ${latestFile}`);
    console.log('✓ getLatestLogFile 成功\n');
  } catch (err) {
    console.error(`✗ getLatestLogFile 失败: ${(err as Error).message}\n`);
  }

  if (!latestFile) {
    console.error('✗ 无法获取最新文件，退出');
    connectionManager.closeAll();
    process.exit(1);
  }

  const filePath = `${LOG_DIR}/${latestFile}`;

  // 6. view_log (tail)
  console.log('【6】测试 view_log (tail 15 行, 最新文件)...');
  try {
    const tailContent = await viewLog(connectionManager, serverConfig, filePath, 'tail', 15);
    console.log('--- tail 输出 (最后 3 行) ---');
    const tailLines = tailContent.trim().split('\n');
    tailLines.slice(-3).forEach((l) => console.log(l));
    console.log(`--- 共 ${tailLines.length} 行 ---`);
    console.log('✓ tail 成功\n');
  } catch (err) {
    console.error(`✗ tail 失败: ${(err as Error).message}\n`);
  }

  // 7. view_log (head)
  console.log('【7】测试 view_log (head 5 行, 最新文件)...');
  try {
    const headContent = await viewLog(connectionManager, serverConfig, filePath, 'head', 5);
    console.log('--- head 输出 ---');
    console.log(headContent.trim());
    console.log('--- 结束 ---');
    console.log('✓ head 成功\n');
  } catch (err) {
    console.error(`✗ head 失败: ${(err as Error).message}\n`);
  }

  // 8. search_log
  console.log('【8】测试 search_log (搜索 "ERROR", 上下文 3 行, 最新文件)...');
  try {
    const { output, matchCount } = await searchLog(
      connectionManager, serverConfig, filePath, 'ERROR', 3, 5, false
    );
    console.log(`--- 搜索结果 (匹配数: ${matchCount}) ---`);
    if (output.trim()) {
      const lines = output.trim().split('\n');
      lines.slice(0, 10).forEach((l) => console.log(l));
      if (lines.length > 10) console.log(`... (共 ${lines.length} 行输出)`);
    } else {
      console.log('(无匹配)');
    }
    console.log('--- 结束 ---');
    console.log('✓ search 成功\n');
  } catch (err) {
    console.error(`✗ search 失败: ${(err as Error).message}\n`);
  }

  // 清理
  connectionManager.closeAll();
  console.log('=== 集成测试完成 ===');
}

runIntegrationTest().catch((err) => {
  console.error(`集成测试失败: ${err.message}`);
  process.exit(1);
});
