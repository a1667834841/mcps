# MCP Database Tests

`@ggball/mcp-database` 的单元 / 集成测试，覆盖三种数据库（SQL Server / MySQL / OceanBase）与 SQL 安全机制。

## 测试文件一览

| 测试文件                        | 覆盖内容                                               | 依赖                                       |
| ------------------------------- | ------------------------------------------------------ | ------------------------------------------ |
| `test-mcp-methods.ts`           | 通过 MCP 通用流程跑全部工具方法（默认按 `.env` 连接）  | 任一数据库 + `.env`                        |
| `test-mcp-methods-sqlserver.ts` | 同上，强制走 SQL Server                                | SQL Server + `.env`（或 `.env.sqlserver`） |
| `test-integration-oceanbase.ts` | OceanBase 端到端集成测试（连接、列库、查表、执行查询） | OceanBase 实例                             |
| `test-sqlserver.ts`             | 直接测 SQL Server Provider                             | SQL Server                                 |
| `test-mysql.ts`                 | 直接测 MySQL Provider                                  | MySQL                                      |
| `test-oceanbase.ts`             | 直接测 OceanBase Provider                              | OceanBase                                  |
| `test-sql-safety.ts`            | 只读校验、危险关键字拦截、行数限制等安全机制           | 无（纯逻辑）                               |

## 运行测试

### 运行全部（按 `.env`）

```bash
npm test
```

### 单数据库

```bash
npm run test:sqlserver   # → test-mcp-methods-sqlserver.ts
npm run test:mysql       # → test-mysql.ts
npm run test:oceanbase   # → test-oceanbase.ts
```

### 直接调 tsx 运行单个文件

```bash
npx tsx tests/test-integration-oceanbase.ts
npx tsx tests/test-sql-safety.ts
```

## 配置

测试默认读取项目根目录的 `.env`（参见 [`../.env.example`](../.env.example)）。SQL Server 测试若需独立配置，可创建 `.env.sqlserver`。

## 覆盖的 MCP 工具方法

1. `connect` — 建立连接 / 连接池
2. `list_databases` — 列出所有数据库
3. `list_tables` — 列出指定库的表
4. `describe_table` — 表结构
5. `execute_query` — SQL 查询（含只读拦截）
6. `get_table_indexes` — 表索引
7. `get_table_stats` — 表统计
