# MCP Database Server (Node.js / TypeScript)

一个支持 **SQL Server / MySQL / OceanBase** 三种数据库的 Model Context Protocol（MCP）服务器，基于 TypeScript + Node.js 构建，作为 npm 包 [`@ggball/mcp-database`](https://www.npmjs.com/package/@ggball/mcp-database) 发布。

## 简介

MCP（Model Context Protocol）是允许 AI 助手安全、统一访问外部数据源与工具的开放协议。`@ggball/mcp-database` 让 MCP Client（Claude Desktop、Claude Code、Codex CLI、Qoder、OpenCode 等）通过统一的工具集查询任意数据库实例：

- 一个 MCP Server 进程对应一个数据库连接，通过 server 名前缀区分目标库
- 通过 `DB_TYPE` 环境变量在 `sqlserver` / `mysql` / `oceanbase` 之间切换
- 默认开启只读保护（`DB_READONLY=true`），仅允许 `SELECT` / `SHOW` / `DESCRIBE` / `EXPLAIN`
- 默认单次查询返回上限 1000 行（可调）
- 内置连接池

## 功能特性

- 列出实例上的所有数据库
- 列出指定数据库的所有表
- 获取表结构信息（字段、类型、主键、可空等）
- 执行受保护的 SELECT 查询
- 获取表的索引信息
- 获取表的统计信息（行数、存储大小等）

## 安装

### 全局安装（推荐）

```bash
npm install -g @ggball/mcp-database
```

安装后系统会暴露 `mcp-database` 可执行命令。

### 通过 npx 直接运行

```bash
npx @ggball/mcp-database
```

### 从源码构建

环境要求：

- Node.js ≥ 18.0.0
- npm ≥ 9.0.0
- 任一目标数据库实例（SQL Server / MySQL / OceanBase）

```bash
npm install
npm run build
npm start
```

## 配置

通过环境变量配置（也可在工作目录创建 `.env` 文件，参考 `.env.example`）。

### 通用变量（推荐）

| 变量                          | 必填 | 默认                     | 说明                                |
| ----------------------------- | ---- | ------------------------ | ----------------------------------- |
| `DB_TYPE`                     | 是   | `sqlserver`              | `sqlserver` / `mysql` / `oceanbase` |
| `DB_HOST`                     | 否   | `localhost`              | 主机                                |
| `DB_PORT`                     | 否   | `1433` / `3306` / `2881` | 按 `DB_TYPE` 自动选默认端口         |
| `DB_USER`                     | 否   | `root`                   | 用户名                              |
| `DB_PASSWORD`                 | 否   | (空)                     | 密码                                |
| `DB_DATABASE`                 | 否   | `master`                 | 默认数据库                          |
| `DB_CHARSET`                  | 否   | `utf8mb4`                | 字符集（MySQL / OceanBase）         |
| `DB_READONLY`                 | 否   | `true`                   | 只读模式开关，置 `false` 才允许 DML |
| `DB_MAX_ROWS`                 | 否   | `1000`                   | 单次查询最大返回行数                |
| `DB_REQUEST_TIMEOUT`          | 否   | `30000`                  | 请求超时（毫秒）                    |
| `DB_ENCRYPT`                  | 否   | `true`                   | 启用加密（仅 SQL Server）           |
| `DB_TRUST_SERVER_CERTIFICATE` | 否   | `true`                   | 信任自签证书（仅 SQL Server）       |

### 数据库专属覆盖（可选）

需要为某个数据库类型单独覆盖配置时使用 `<TYPE>_*` 前缀：

| 前缀         | 适用       | 可覆盖字段                                                                                  |
| ------------ | ---------- | ------------------------------------------------------------------------------------------- |
| `SQLSERVER_` | SQL Server | `HOST` / `PORT` / `USER` / `PASSWORD` / `DATABASE` / `ENCRYPT` / `TRUST_SERVER_CERTIFICATE` |
| `MYSQL_`     | MySQL      | `HOST` / `PORT` / `USER` / `PASSWORD` / `DATABASE` / `CHARSET`                              |
| `OCEANBASE_` | OceanBase  | `HOST` / `PORT` / `USER` / `PASSWORD` / `DATABASE` / `CHARSET`                              |

**优先级**：专属变量 > 通用 `DB_*` > 默认值。

### 配置示例

#### SQL Server

```env
DB_TYPE=sqlserver
DB_HOST=localhost
DB_PORT=1433
DB_USER=sa
DB_PASSWORD=YourPassword123
DB_DATABASE=MyDatabase
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=true
```

#### MySQL

```env
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=YourPassword123
DB_DATABASE=mydb
DB_CHARSET=utf8mb4
```

#### OceanBase

```env
DB_TYPE=oceanbase
DB_HOST=localhost
DB_PORT=2881
DB_USER=root
DB_PASSWORD=YourPassword123
DB_DATABASE=mydb
DB_CHARSET=utf8mb4
```

> OceanBase 复用 MySQL 协议（底层使用 `mysql2` 驱动），如需多租户连接，把 `DB_USER` 写成 `user@tenant` 形式。

## 在 MCP Client 中接入

通用 JSON 配置（适用 Claude Desktop / Claude Code / Qoder / OpenCode 等）：

```json
{
  "mcpServers": {
    "<your-db-server-id>": {
      "command": "mcp-database",
      "env": {
        "DB_TYPE": "oceanbase",
        "DB_HOST": "<your-db-host>",
        "DB_PORT": "2881",
        "DB_USER": "<your-user>",
        "DB_PASSWORD": "<your-password>",
        "DB_DATABASE": "<your-database>",
        "DB_CHARSET": "utf8mb4",
        "DB_READONLY": "true",
        "DB_MAX_ROWS": "1000"
      }
    }
  }
}
```

> 同一 Client 中可以注册多个 server（每个对应一个独立连接 / 数据库），通过 server 名前缀区分。

Codex CLI（TOML）：

```toml
[mcp_servers.<your-db-server-id>]
command = "mcp-database"
env = { DB_TYPE = "oceanbase", DB_HOST = "<your-db-host>", DB_PORT = "2881", DB_USER = "<your-user>", DB_PASSWORD = "<your-password>", DB_DATABASE = "<your-database>", DB_CHARSET = "utf8mb4", DB_READONLY = "true", DB_MAX_ROWS = "1000" }
```

未全局安装时，把 `command` 换成 `npx`、`args` 加上 `["@ggball/mcp-database"]` 即可；从源码运行则 `command="node"`，`args=["<repo>/database/dist/index.js"]`。

修改配置后重启 MCP Client（或在 MCP 面板 reload 对应 server）。

## 提供的 MCP 工具

| 工具                | 用途                               | 关键参数                             |
| ------------------- | ---------------------------------- | ------------------------------------ |
| `list_databases`    | 列出实例上的所有数据库             | 无                                   |
| `list_tables`       | 列出指定库的所有表                 | `database` (`schema?` 仅 SQL Server) |
| `describe_table`    | 获取表结构（字段 / 类型 / 主键等） | `database`, `table` (`schema?`)      |
| `get_table_indexes` | 获取表索引                         | `database`, `table` (`schema?`)      |
| `get_table_stats`   | 获取表统计（行数、占用空间等）     | `database`, `table` (`schema?`)      |
| `execute_query`     | 执行 SQL（默认只读，受行数限制）   | `query`, `database?`                 |

> SQL Server 的 `schema` 参数缺省为 `dbo`；MySQL / OceanBase 不使用该参数。

## 使用示例

```
# 探索数据库
You: 列出所有可用数据库
You: 看一下 mydb 里有哪些表

# 查询数据
You: 查询 Orders 表最近 10 条记录
   Claude: [先调 describe_table 了解结构，再 execute_query]

# 分析表结构
You: 分析 Users 表的结构、索引和统计
   Claude: [并行调用 describe_table / get_table_indexes / get_table_stats]
```

## 安全说明

- `execute_query` 默认开启只读保护：仅允许 `SELECT` / `SHOW` / `DESCRIBE` / `EXPLAIN`，自动拦截 `INSERT` / `UPDATE` / `DELETE` / `DROP` / `ALTER` 等 DML / DDL 关键字
- 如需写入，显式设置 `DB_READONLY=false`（**谨慎使用**，建议仅在开发环境短暂开启）
- 单次查询返回行数受 `DB_MAX_ROWS`（默认 1000）限制，超过会自动截断
- 建议为 MCP 创建**最小权限专用账号**，禁止使用生产环境的 `root` / `sa`

## 开发

### 项目结构

```
database/
├── src/
│   ├── index.ts            # MCP Server 入口与工具注册
│   ├── config/             # 各数据库类型的配置解析
│   │   ├── base.ts
│   │   ├── index.ts
│   │   ├── mysql.ts
│   │   ├── oceanbase.ts
│   │   └── sqlserver.ts
│   ├── providers/          # 各数据库的 Provider 实现
│   │   ├── base.ts
│   │   ├── factory.ts
│   │   ├── mysql.ts
│   │   ├── oceanbase.ts
│   │   └── sqlserver.ts
│   ├── utils/              # SQL 解析、只读校验、行数限制
│   │   ├── readonly-check.ts
│   │   ├── sql-parser.ts
│   │   └── sql-row-limiter.ts
│   └── types/              # 公共类型定义
├── tests/                  # 单元 / 集成测试
├── dist/                   # 编译输出
├── package.json
└── tsconfig.json
```

### 常用脚本

- `npm run build` — TypeScript 编译
- `npm run watch` — 增量编译
- `npm run dev` — 编译后直接运行
- `npm start` — 运行已构建产物
- `npm test` — 运行通用 MCP 方法测试（默认按 `.env` 走 OceanBase）
- `npm run test:sqlserver` / `test:mysql` / `test:oceanbase` — 单数据库测试

详见 [`tests/README.md`](./tests/README.md)。

### 运行时依赖

- [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — MCP TypeScript SDK
- [`tedious`](https://www.npmjs.com/package/tedious) — SQL Server 驱动
- [`mysql2`](https://www.npmjs.com/package/mysql2) — MySQL / OceanBase 驱动
- [`zod`](https://www.npmjs.com/package/zod) — Schema 校验
- [`dotenv`](https://www.npmjs.com/package/dotenv) — `.env` 加载

## License

MIT

## 参考

- [MCP 协议规范](https://modelcontextprotocol.io)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
