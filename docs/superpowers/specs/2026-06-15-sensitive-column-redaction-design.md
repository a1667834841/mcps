# 数据库 MCP 敏感字段脱敏 - 设计文档

**日期**：2026-06-15
**目标模块**：`database/`（npm 包 `@ggball/mcp-database`）

## 1. 目标

为数据库 MCP Server 增加敏感字段处理能力：维护一份全局敏感字段名单，当 MCP 工具返回的结果命中名单中的字段时，**将该列整列删除**（字段名与数据都不出现在返回结果中），防止 AI 助手经 MCP 接触到敏感数据。

## 2. 背景与现状

`database/` 是一个支持 SQL Server / MySQL / OceanBase 的 MCP Server，对外暴露 6 个工具：

| 工具 | 返回内容 | 是否暴露字段/数据 |
|------|---------|:---:|
| `list_databases` | 数据库列表 | 否 |
| `list_tables` | 表列表 | 否 |
| `describe_table` | 表结构（字段定义、主键） | **是** |
| `execute_query` | 查询结果（列 + 行数据） | **是** |
| `get_table_indexes` | 索引信息 | 否 |
| `get_table_stats` | 表统计 | 否 |

现有安全机制已形成成熟模式（脱敏功能将与之对齐）：

- **配置层**（`config/base.ts`）：`getSafetyConfig()` 读 `DB_READONLY` / `DB_MAX_ROWS` 等环境变量
- **工具层**（`index.ts`）：handler 拿到 provider 结果后，调纯函数处理再输出
- **纯函数层**（`utils/`）：`validateReadOnly`（只读校验）、`injectRowLimit`（行数限制）

## 3. 方案选型

选定 **方案 A：工具层脱敏 + 环境变量配置**。理由：

- 与现有安全机制模式完全一致（config 读配置 → 工具层调纯函数处理）
- 3 个 provider（mysql / sqlserver / oceanbase）零改动
- 配置走 `.env` 环境变量，符合项目"所有配置都走 `DB_*` 环境变量"的约定

备选方案（未采用）：
- 方案 B（provider 层脱敏）：需改 3 个 provider + 基类，破坏 provider 单一职责
- 方案 C（MCP 输出中间件拦截）：SDK 无标准钩子，需 hack 输出对象，脆弱

## 4. 架构与数据流

```
配置层 (config/base.ts)
  └─ SensitiveConfig 接口 + getSensitiveConfig()
     读 DB_SENSITIVE_COLUMNS 环境变量 + 合并内置名单
        │
        ▼
工具层 (index.ts)
  describe_table handler ──┐
  execute_query  handler ──┤
                            ▼
脱敏层 (utils/column-redactor.ts)
  └─ redactTableSchema(schema, matchSet)   — 处理 describe_table 返回
  └─ redactQueryResult(result, matchSet)   — 处理 execute_query 返回
        (纯函数，处理 provider 返回的结果对象)
```

**`execute_query` 工具内执行顺序**：
1. 只读校验 `validateReadOnly`
2. 行数限制 `injectRowLimit`
3. 执行查询
4. **脱敏 `redactQueryResult`**（最后一步，保证输出前一定过滤）

脱敏放在最后，确保即使前面的行数限制、SQL 重写改变了结果，最终对外暴露的列一定是干净的。

**覆盖范围**：仅 `describe_table` 与 `execute_query` 两个工具。其余 4 个工具不返回用户业务列数据，无需处理。

## 5. 配置设计

### 5.1 环境变量

新增一个环境变量，与现有 `DB_READONLY` / `DB_MAX_ROWS` 同模式：

| 变量 | 必填 | 默认 | 说明 |
|------|:---:|------|------|
| `DB_SENSITIVE_COLUMNS` | 否 | (空) | 用户自定义敏感列名，逗号分隔，精确匹配（大小写不敏感）。例：`password,id_card,ssn,phone` |

### 5.2 内置名单

代码中内置常用敏感字段，开箱即用。生效名单 = **内置名单 ∪ 用户配置**（追加合并）。

```ts
export const BUILTIN_SENSITIVE_COLUMNS = [
  // 凭证
  'password', 'passwd', 'pwd', 'secret', 'token', 'api_key', 'apikey',
  'private_key', 'credential',
  // 个人隐私
  'id_card', 'idcard', 'ssn', 'mobile', 'phone', 'telephone', 'email', 'mail',
  // 金融
  'bank_card', 'bankcard', 'card_no', 'cardno', 'credit_card',
];
```

### 5.3 配置接口与加载逻辑

```ts
export interface SensitiveConfig {
  enabled: boolean;       // 合并后名单非空时为 true
  columns: string[];      // 合并后完整名单（原样大小写，用于日志/展示）
  matchSet: Set<string>;  // 小写化集合，供脱敏函数 O(1) 查询
}

export function getSensitiveConfig(): SensitiveConfig {
  const userCols = (process.env.DB_SENSITIVE_COLUMNS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const merged = [...BUILTIN_SENSITIVE_COLUMNS, ...userCols];
  const matchSet = new Set(merged.map(c => c.toLowerCase()));
  return {
    enabled: matchSet.size > 0,  // 内置非空，默认 enabled=true
    columns: merged,
    matchSet,
  };
}
```

### 5.4 行为矩阵

| 场景 | 行为 |
|------|------|
| 用户未配 `DB_SENSITIVE_COLUMNS` | 仅内置名单生效，`enabled: true` |
| 用户配置 `DB_SENSITIVE_COLUMNS` | 追加到内置名单后去重 |
| 用户配置与内置重复 | 去重，不重复处理 |

## 6. 脱敏函数实现

新增 `src/utils/column-redactor.ts`，两个纯函数。

### 6.1 `redactTableSchema`（describe_table）

处理 `TableSchema`：`{ table, columns: ColumnInfo[], primary_keys: string[] }`

```ts
export function redactTableSchema(
  schema: TableSchema,
  matchSet: Set<string>
): TableSchema {
  return {
    ...schema,
    columns: schema.columns.filter(c => !matchSet.has(c.name.toLowerCase())),
    primary_keys: schema.primary_keys.filter(pk => !matchSet.has(pk.toLowerCase())),
  };
}
```

- 删 `columns` 数组里命中项（列定义直接消失）
- **联动删 `primary_keys`**：避免出现"主键指向不存在列"的矛盾信息

### 6.2 `redactQueryResult`（execute_query）

处理 `QueryResult`：`{ columns: string[], rows: QueryResultRow[], row_count, limited }`

```ts
export function redactQueryResult(
  result: QueryResult,
  matchSet: Set<string>
): QueryResult {
  const hitSet = new Set(
    result.columns
      .map((col, i) => (matchSet.has(col.toLowerCase()) ? i : -1))
      .filter(i => i >= 0)
  );

  if (hitSet.size === 0) return result; // 无命中，原样返回引用

  const newColumns = result.columns.filter((_, i) => !hitSet.has(i));
  const newRows = result.rows.map(row => {
    const newRow: QueryResultRow = {};
    for (const [key, value] of Object.entries(row)) {
      if (!matchSet.has(key.toLowerCase())) {
        newRow[key] = value;
      }
    }
    return newRow;
  });

  return {
    ...result,
    columns: newColumns,
    rows: newRows,
    // row_count 不变（行数不变，只是列少了）
  };
}
```

- `columns` 是字符串数组（列名顺序），删命中项
- `rows` 是对象数组（key=列名），遍历每行删命中 key
- 用列名小写匹配 `matchSet`
- 无命中时**原样返回引用**（零拷贝，避免无谓开销）

### 6.3 导出

`src/utils/index.ts` 新增导出：
```ts
export { redactTableSchema, redactQueryResult } from './column-redactor.js';
```

## 7. 工具层集成

### 7.1 导入（`index.ts` 顶部）

```ts
import { getDatabaseType, getSafetyConfig, getSensitiveConfig } from './config/index.js';
import { validateReadOnly, injectRowLimit, redactTableSchema, redactQueryResult } from './utils/index.js';
```

### 7.2 `describe_table` handler

拿到 schema 后、`JSON.stringify` 前插入脱敏：

```ts
async ({ database, table, schema = 'dbo' }) => {
  try {
    let tableSchema = await dbProvider.describeTable(database, table, schema);

    const { enabled, matchSet } = getSensitiveConfig();
    if (enabled) {
      tableSchema = redactTableSchema(tableSchema, matchSet);
    }

    return { content: [{ type: 'text', text: JSON.stringify(tableSchema, null, 2) }] };
  } catch (error: any) { /* 原有错误处理不变 */ }
}
```

### 7.3 `execute_query` handler

在行数限制注入之后、`JSON.stringify` 前插入脱敏：

```ts
const limitedQuery = injectRowLimit(query, dbType, maxRows);

try {
  let result = await dbProvider.executeQuery(limitedQuery, database);

  const { enabled, matchSet } = getSensitiveConfig();
  if (enabled) {
    result = redactQueryResult(result, matchSet);
  }

  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
} catch (error: any) { /* 原有错误处理不变 */ }
```

## 8. 边界情况

| 场景 | 行为 |
|------|------|
| 列名大小写不同（`Password` vs `password`） | `matchSet` 小写化 + 匹配时 `toLowerCase()`，命中 |
| 所有列都被命中（整表敏感） | `describe_table` 返回空 `columns`、空 `primary_keys`；`execute_query` 返回空 `columns` + 行为空对象。**不报错**，如实反映"无可见列" |
| `SELECT *` 查到敏感列 | `execute_query` 的 `columns` 和 `rows` 同步删该列 |
| 用户用 `SELECT password AS pwd FROM users` 别名 | **仅按输出列名 `pwd` 匹配**，不命中 `password`（精确匹配输出列名，不做语义还原）。这是精确匹配的固有行为 |
| `getSafetyConfig()` 与 `getSensitiveConfig()` | 各自独立读取，互不影响。脱敏开关不依赖只读开关 |

## 9. 不改动的部分

- 3 个 provider（mysql / sqlserver / oceanbase）**零改动**
- 其余 4 个工具（list_databases / list_tables / get_table_indexes / get_table_stats）**不处理**
- `SafetyConfig` 接口不动（脱敏用独立的 `SensitiveConfig`）
- `QueryResult` / `TableSchema` 等类型不动（复用现有结构）

## 10. 测试策略

新增 `tests/test-column-redactor.ts`（纯函数，无需连库）：

**`redactTableSchema`**：
- 命中删列 + 联动删主键
- 无命中原样返回
- 大小写不敏感匹配

**`redactQueryResult`**：
- 命中删 columns + rows 对应列
- 无命中返回同一引用（零拷贝）
- 空 columns 安全处理

**`getSensitiveConfig`**：
- 内置名单默认生效
- 用户配置 `DB_SENSITIVE_COLUMNS` 追加合并去重
- `matchSet` 全小写

## 11. 文档更新

- `README.md` 配置表新增 `DB_SENSITIVE_COLUMNS` 一行
- `README.md` 安全说明新增"敏感字段脱敏"段落（说明内置名单 + 合并规则 + 仅按输出列名精确匹配）
- `.env.example` 新增 `DB_SENSITIVE_COLUMNS` 示例（注释形式）

## 12. 变更文件清单

| 文件 | 改动 |
|------|------|
| `database/src/config/base.ts` | 新增 `BUILTIN_SENSITIVE_COLUMNS` 常量、`SensitiveConfig` 接口、`getSensitiveConfig()` |
| `database/src/config/index.ts` | 无需改（`export * from './base.js'` 自动导出新内容） |
| `database/src/utils/column-redactor.ts` | **新增** `redactTableSchema`、`redactQueryResult` |
| `database/src/utils/index.ts` | 新增两个函数的导出 |
| `database/src/index.ts` | `describe_table`、`execute_query` 两个 handler 集成脱敏 |
| `database/tests/test-column-redactor.ts` | **新增** 纯函数测试 |
| `database/README.md` | 配置表 + 安全说明 |
| `database/.env.example` | 新增 `DB_SENSITIVE_COLUMNS` 示例 |
