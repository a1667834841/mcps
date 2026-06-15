---
name: mcp-database
description: Query and inspect SQL Server, MySQL, and OceanBase databases via the @ggball/mcp-database MCP server. Use when the user asks to query a database, inspect tables/indexes/stats, run SQL, or work with any of the registered database servers. Also use when the user mentions OceanBase, MySQL, SQL Server, or asks for table schemas, row counts, or query results.
---

# MCP Database

通过 `@ggball/mcp-database` 提供的 MCP 工具访问 SQL Server / MySQL / OceanBase。一个 MCP server 进程对应一个数据库连接，通过 server 名前缀区分目标库。



## 可用工具（每个 server 都有）

| 工具                | 用途                         | 关键参数            |
| ------------------- | ---------------------------- | ------------------- |
| `list_databases`    | 列出实例上的所有库           | 无                  |
| `list_tables`       | 列出指定库的表               | `database`          |
| `describe_table`    | 查看表结构（字段/类型/主键） | `database`, `table` |
| `get_table_indexes` | 查看表索引                   | `database`, `table` |
| `get_table_stats`   | 查看表统计（行数等)          | `database`, `table` |
| `execute_query`     | 执行 SQL（默认只读）         | `database`, `query` |

## 标准工作流

### 1. 不知道库名时先列库

调用 `<server>.list_databases`，从返回中确认目标库名。

### 2. 探查表结构

```
<server>.list_tables(database="<db>")
<server>.describe_table(database="<db>", table="<tbl>")
<server>.get_table_indexes(database="<db>", table="<tbl>")
```

### 3. 执行查询

`execute_query` 默认只读模式（`DB_READONLY=true`），仅允许 `SELECT`/`SHOW`/`DESCRIBE`/`EXPLAIN`。返回行数受 `DB_MAX_ROWS`（默认 1000）限制。

```
<server>.execute_query(
  database="<db>",
  query="SELECT id, name FROM user WHERE state = 1 LIMIT 50"
)
```

## 选择 Server 的规则

- 一个 MCP server 进程对应一个数据库连接，按用户提及的库名 / 环境关键字区分 server
- 不确定时先在各 server 上调用 `list_databases` 对比，再选库名匹配的那个

## 安全规范

- **永远不要**在没有用户确认的情况下执行 `INSERT/UPDATE/DELETE/DROP/ALTER`
- 大表查询必加 `LIMIT`（OceanBase/MySQL）或 `TOP`（SQL Server）
- 模糊搜索优先用主键/索引列过滤

## 常见踩坑

- OceanBase 端口是 **2881** 不是 3306，DB_TYPE 用 `oceanbase`（也可写 `mysql`，二者底层都用 mysql2 驱动）
- SQL Server 跨库查询需用三段式：`[db].[schema].[table]`
- 中文字符串报错时检查 charset：MySQL/OceanBase 用 `utf8mb4`，SQL Server 用 `N'...'` 前缀

## 进阶参考

- 新增/修改数据库连接配置：[reference.md](reference.md)
