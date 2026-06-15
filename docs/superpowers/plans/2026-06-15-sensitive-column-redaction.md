# 数据库 MCP 敏感字段脱敏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为数据库 MCP 增加敏感字段脱敏：维护全局敏感字段名单（内置 + 用户环境变量配置），命中字段时从 `describe_table` 和 `execute_query` 的返回结果中整列删除。

**Architecture:** 配置层（`config/base.ts`）读 `DB_SENSITIVE_COLUMNS` 环境变量并合并内置名单；脱敏层（`utils/column-redactor.ts`）提供两个纯函数处理 provider 返回的结果对象；工具层（`index.ts`）在两个 handler 的 `JSON.stringify` 前调用脱敏。与现有 `validateReadOnly` / `injectRowLimit` 同模式，3 个 provider 零改动。

**Tech Stack:** TypeScript（ESM）、Node.js ≥ 18、`tsx` 跑测试（无测试框架，自定义 `assert` / `assertEqual`）。

**Spec:** `docs/superpowers/specs/2026-06-15-sensitive-column-redaction-design.md`

---

## File Structure

| 文件 | 责任 | 改动类型 |
|------|------|:---:|
| `database/src/config/base.ts` | 内置名单常量、`SensitiveConfig` 接口、`getSensitiveConfig()` | 修改（追加） |
| `database/src/config/index.ts` | barrel 导出 | **无需改**（已是 `export * from './base.js'`） |
| `database/src/utils/column-redactor.ts` | `redactTableSchema`、`redactQueryResult` 纯函数 | 新增 |
| `database/src/utils/index.ts` | barrel 导出 | 修改（追加一行） |
| `database/src/index.ts` | `describe_table`、`execute_query` 两个 handler 集成脱敏 | 修改 |
| `database/tests/test-column-redactor.ts` | 纯函数单测 | 新增 |
| `database/package.json` | 新增 `test:sensitive` 脚本 | 修改 |
| `database/README.md` | 配置表 + 安全说明 | 修改 |
| `database/.env.example` | `DB_SENSITIVE_COLUMNS` 示例 | 修改 |

---

## Task 1: 内置名单与配置加载（config 层）

**Files:**
- Modify: `database/src/config/base.ts`（在文件末尾追加，`getSafetyConfig` 之后）

- [ ] **Step 1: 写 `getSensitiveConfig` 的失败测试**

Create `database/tests/test-column-redactor.ts`，先只写 config 部分的测试（脱敏函数测试在 Task 2 补）：

```ts
/**
 * Sensitive Column Redaction Unit Tests
 *
 * Tests for getSensitiveConfig, redactTableSchema, redactQueryResult.
 * Run with: npx tsx tests/test-column-redactor.ts
 */

import { getSensitiveConfig, BUILTIN_SENSITIVE_COLUMNS } from '../src/config/base.js';
// 下一行在 Task 2 Step 1 取消注释（Task 1 阶段 column-redactor.ts 尚未创建）
// import { redactTableSchema, redactQueryResult } from '../src/utils/column-redactor.js';
import type { TableSchema, QueryResult } from '../src/types/index.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
    if (condition) {
        passed++;
        console.log(`  PASS: ${message}`);
    } else {
        failed++;
        console.error(`  FAIL: ${message}`);
    }
}

function assertEqual(actual: any, expected: any, message: string) {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr === expectedStr) {
        passed++;
        console.log(`  PASS: ${message}`);
    } else {
        failed++;
        console.error(`  FAIL: ${message}`);
        console.error(`    Expected: ${expectedStr}`);
        console.error(`    Actual:   ${actualStr}`);
    }
}

// ============================================================
// getSensitiveConfig Tests
// ============================================================
console.log('\n=== getSensitiveConfig ===\n');

// 内置名单默认生效（未设置 DB_SENSITIVE_COLUMNS）
{
    const saved = process.env.DB_SENSITIVE_COLUMNS;
    delete process.env.DB_SENSITIVE_COLUMNS;
    const cfg = getSensitiveConfig();
    assert(cfg.enabled === true, 'enabled defaults to true (builtin non-empty)');
    assert(cfg.matchSet.has('password'), 'matchSet contains builtin password');
    assert(cfg.matchSet.has('id_card'), 'matchSet contains builtin id_card');
    assert(cfg.matchSet.has('bank_card'), 'matchSet contains builtin bank_card');
    assert(BUILTIN_SENSITIVE_COLUMNS.length >= 15, 'builtin list has reasonable size');
    if (saved !== undefined) process.env.DB_SENSITIVE_COLUMNS = saved;
}

// 用户配置追加合并
{
    const saved = process.env.DB_SENSITIVE_COLUMNS;
    process.env.DB_SENSITIVE_COLUMNS = 'custom_secret, my_column';
    const cfg = getSensitiveConfig();
    assert(cfg.matchSet.has('custom_secret'), 'includes user-configured custom_secret');
    assert(cfg.matchSet.has('my_column'), 'includes user-configured my_column');
    assert(cfg.matchSet.has('password'), 'still includes builtin password');
    assert(cfg.enabled === true, 'enabled when user columns added');
    if (saved !== undefined) process.env.DB_SENSITIVE_COLUMNS = saved;
    else delete process.env.DB_SENSITIVE_COLUMNS;
}

// 重复去重
{
    const saved = process.env.DB_SENSITIVE_COLUMNS;
    process.env.DB_SENSITIVE_COLUMNS = 'password, PASSWORD';
    const cfg = getSensitiveConfig();
    const passwordEntries = cfg.columns.filter(c => c.toLowerCase() === 'password');
    assertEqual(passwordEntries.length, 2, 'preserves original-case duplicates in columns array');
    // matchSet 去重
    assert(cfg.matchSet.has('password'), 'matchSet has password (deduped, case-insensitive)');
    if (saved !== undefined) process.env.DB_SENSITIVE_COLUMNS = saved;
    else delete process.env.DB_SENSITIVE_COLUMNS;
}

// ============================================================
// Summary（redactor 测试在 Task 2 追加到这里之前）
// ============================================================
console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('='.repeat(50));

if (failed > 0) {
    process.exit(1);
}
```

- [ ] **Step 2: 运行测试确认失败**

Run（在 `database/` 目录下）:
```bash
npx tsx tests/test-column-redactor.ts
```
Expected: FAIL，报错 `getSensitiveConfig` / `BUILTIN_SENSITIVE_COLUMNS` 不存在或 `column-redactor.js` 模块找不到。

- [ ] **Step 3: 在 `config/base.ts` 追加实现**

在 `database/src/config/base.ts` 文件**末尾**追加（紧跟现有 `getCommonConfig` 函数之后）：

```ts
/**
 * Built-in common sensitive column names (case-insensitive match).
 * Covers credentials, personal privacy, and financial data naming variants.
 */
export const BUILTIN_SENSITIVE_COLUMNS: string[] = [
  // 凭证
  'password', 'passwd', 'pwd', 'secret', 'token', 'api_key', 'apikey',
  'private_key', 'credential',
  // 个人隐私
  'id_card', 'idcard', 'ssn', 'mobile', 'phone', 'telephone', 'email', 'mail',
  // 金融
  'bank_card', 'bankcard', 'card_no', 'cardno', 'credit_card',
];

/**
 * Sensitive column redaction configuration
 */
export interface SensitiveConfig {
  enabled: boolean;
  columns: string[];      // 合并后完整名单（原样大小写，用于日志/展示）
  matchSet: Set<string>;  // 小写化集合，供脱敏函数 O(1) 查询
}

/**
 * Get sensitive column config from environment + builtin list.
 * Effective list = BUILTIN_SENSITIVE_COLUMNS ∪ DB_SENSITIVE_COLUMNS
 */
export function getSensitiveConfig(): SensitiveConfig {
  const userCols = (process.env.DB_SENSITIVE_COLUMNS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const merged = [...BUILTIN_SENSITIVE_COLUMNS, ...userCols];
  const matchSet = new Set(merged.map(c => c.toLowerCase()));

  return {
    enabled: matchSet.size > 0,
    columns: merged,
    matchSet,
  };
}
```

- [ ] **Step 4: 运行测试确认 config 部分通过**

Run:
```bash
npx tsx tests/test-column-redactor.ts
```
Expected: `getSensitiveConfig` 三个测试块 PASS。此时测试文件末尾的 import 中 `column-redactor` 行仍为注释状态，不会报错。

- [ ] **Step 5: 提交**

```bash
cd database
git add src/config/base.ts tests/test-column-redactor.ts
git commit -m "feat(config): add SensitiveConfig with builtin list and getSensitiveConfig"
```

---

## Task 2: 脱敏纯函数（utils 层）

**Files:**
- Create: `database/src/utils/column-redactor.ts`
- Modify: `database/src/utils/index.ts`（追加导出）
- Modify: `database/tests/test-column-redactor.ts`（补 redactor 测试，取消注释 import）

- [ ] **Step 1: 在测试文件中补 redactor 测试**

打开 `database/tests/test-column-redactor.ts`：

1. 取消文件顶部被注释的 import 行（删掉前面的 `// `）：
   ```ts
   import { redactTableSchema, redactQueryResult } from '../src/utils/column-redactor.js';
   ```

2. 在 `// === Summary ===` 注释块**之前**插入以下测试块：

```ts
// ============================================================
// redactTableSchema Tests
// ============================================================
console.log('\n=== redactTableSchema ===\n');

// 命中删列 + 联动删主键
{
    const schema: TableSchema = {
        table: 'users',
        columns: [
            { name: 'id', position: 1, data_type: 'int', nullable: false },
            { name: 'name', position: 2, data_type: 'varchar', nullable: false },
            { name: 'password', position: 3, data_type: 'varchar', nullable: false },
        ],
        primary_keys: ['id', 'password'],
    };
    const matchSet = new Set(['password']);
    const result = redactTableSchema(schema, matchSet);
    assertEqual(result.columns.length, 2, 'removes hit column from columns');
    assertEqual(result.columns.map(c => c.name), ['id', 'name'], 'keeps non-sensitive columns');
    assertEqual(result.primary_keys, ['id'], 'removes hit column from primary_keys too');
    assertEqual(result.table, 'users', 'preserves table name');
}

// 无命中原样返回（结构相等）
{
    const schema: TableSchema = {
        table: 'logs',
        columns: [
            { name: 'id', position: 1, data_type: 'int', nullable: false },
            { name: 'msg', position: 2, data_type: 'text', nullable: true },
        ],
        primary_keys: ['id'],
    };
    const matchSet = new Set(['password', 'email']);
    const result = redactTableSchema(schema, matchSet);
    assertEqual(result.columns.length, 2, 'no hit: columns unchanged');
    assertEqual(result.primary_keys, ['id'], 'no hit: primary_keys unchanged');
}

// 大小写不敏感
{
    const schema: TableSchema = {
        table: 't',
        columns: [
            { name: 'ID', position: 1, data_type: 'int', nullable: false },
            { name: 'Password', position: 2, data_type: 'varchar', nullable: false },
        ],
        primary_keys: ['ID'],
    };
    const matchSet = new Set(['password']); // 小写
    const result = redactTableSchema(schema, matchSet);
    assertEqual(result.columns.map(c => c.name), ['ID'], 'matches case-insensitively');
}

// ============================================================
// redactQueryResult Tests
// ============================================================
console.log('\n=== redactQueryResult ===\n');

// 命中删 columns + rows 对应列
{
    const result: QueryResult = {
        columns: ['id', 'name', 'password'],
        rows: [
            { id: 1, name: 'alice', password: 'hashed1' },
            { id: 2, name: 'bob', password: 'hashed2' },
        ],
        row_count: 2,
        limited: false,
    };
    const matchSet = new Set(['password']);
    const redacted = redactQueryResult(result, matchSet);
    assertEqual(redacted.columns, ['id', 'name'], 'removes hit column from columns');
    assertEqual(redacted.row_count, 2, 'preserves row_count');
    assert(redacted.rows[0].password === undefined, 'removes password key from row 0');
    assert(redacted.rows[1].password === undefined, 'removes password key from row 1');
    assertEqual(redacted.rows[0].id, 1, 'preserves non-sensitive value in row 0');
}

// 无命中返回同一引用（零拷贝）
{
    const result: QueryResult = {
        columns: ['id', 'name'],
        rows: [{ id: 1, name: 'a' }],
        row_count: 1,
        limited: false,
    };
    const matchSet = new Set(['password']);
    const redacted = redactQueryResult(result, matchSet);
    assert(redacted === result, 'returns same reference when no hit (zero-copy)');
}

// 所有列都被命中（整表敏感）→ 返回空 columns + 空对象行
{
    const result: QueryResult = {
        columns: ['password', 'token'],
        rows: [
            { password: 'p1', token: 't1' },
            { password: 'p2', token: 't2' },
        ],
        row_count: 2,
        limited: false,
    };
    const matchSet = new Set(['password', 'token']);
    const redacted = redactQueryResult(result, matchSet);
    assertEqual(redacted.columns, [], 'all-sensitive: columns empty');
    assertEqual(Object.keys(redacted.rows[0]), [], 'all-sensitive: row 0 has no keys');
    assertEqual(redacted.row_count, 2, 'all-sensitive: row_count preserved');
}

// 大小写不敏感
{
    const result: QueryResult = {
        columns: ['ID', 'Email'],
        rows: [{ ID: 1, Email: 'a@b.com' }],
        row_count: 1,
        limited: false,
    };
    const matchSet = new Set(['email']);
    const redacted = redactQueryResult(result, matchSet);
    assertEqual(redacted.columns, ['ID'], 'matches column name case-insensitively');
    assert(redacted.rows[0].Email === undefined, 'removes Email key case-insensitively');
}

// 空 columns 安全处理
{
    const result: QueryResult = {
        columns: [],
        rows: [],
        row_count: 0,
        limited: false,
    };
    const matchSet = new Set(['password']);
    const redacted = redactQueryResult(result, matchSet);
    assert(redacted === result, 'empty columns: returns same reference');
}
```

- [ ] **Step 2: 运行测试确认 redactor 部分失败**

Run:
```bash
npx tsx tests/test-column-redactor.ts
```
Expected: FAIL，`Cannot find module '../src/utils/column-redactor.js'`。

- [ ] **Step 3: 创建 `column-redactor.ts` 实现**

Create `database/src/utils/column-redactor.ts`:

```ts
/**
 * Column Redactor
 *
 * Removes sensitive columns from provider results before output.
 * Pure functions: take data + matchSet, return filtered data.
 *
 * Used by describe_table and execute_query tool handlers.
 */

import { TableSchema, QueryResult, QueryResultRow } from '../types/index.js';

/**
 * Remove sensitive columns from a TableSchema (describe_table result).
 * Removes hit columns from both `columns` array and `primary_keys` array
 * (avoids leaving a primary_key pointing at a non-existent column).
 */
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

/**
 * Remove sensitive columns from a QueryResult (execute_query result).
 * Removes hit columns from the `columns` array and the corresponding key
 * from every row object. Returns the same reference if nothing matched
 * (zero-copy optimization).
 */
export function redactQueryResult(
  result: QueryResult,
  matchSet: Set<string>
): QueryResult {
  const hitSet = new Set(
    result.columns
      .map((col, i) => (matchSet.has(col.toLowerCase()) ? i : -1))
      .filter(i => i >= 0)
  );

  if (hitSet.size === 0) return result;

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
  };
}
```

- [ ] **Step 4: 在 `utils/index.ts` 追加导出**

Modify `database/src/utils/index.ts`，在文件末尾追加一行：

```ts
export { redactTableSchema, redactQueryResult } from './column-redactor.js';
```

（最终 `utils/index.ts` 完整内容应为：）
```ts
/**
 * Utils barrel export
 */

export { stripCommentsAndStrings, splitStatements } from './sql-parser.js';
export { isReadOnlyStatement, validateReadOnly } from './readonly-check.js';
export { injectRowLimit } from './sql-row-limiter.js';
export { redactTableSchema, redactQueryResult } from './column-redactor.js';
```

- [ ] **Step 5: 运行全部 redactor 测试确认通过**

Run:
```bash
npx tsx tests/test-column-redactor.ts
```
Expected: 全部测试 PASS（config + redactor 两个模块），`Results: N passed, 0 failed`。

- [ ] **Step 6: 提交**

```bash
cd database
git add src/utils/column-redactor.ts src/utils/index.ts tests/test-column-redactor.ts
git commit -m "feat(utils): add redactTableSchema and redactQueryResult pure functions"
```

---

## Task 3: 工具层集成（index.ts 两个 handler）

**Files:**
- Modify: `database/src/index.ts:17`（import 行）
- Modify: `database/src/index.ts:148-171`（describe_table handler）
- Modify: `database/src/index.ts:185-230`（execute_query handler）

- [ ] **Step 1: 更新 import 行**

Modify `database/src/index.ts` 第 17 行，把：
```ts
import { getDatabaseType, getSafetyConfig } from './config/index.js';
import { validateReadOnly, injectRowLimit } from './utils/index.js';
```
改为：
```ts
import { getDatabaseType, getSafetyConfig, getSensitiveConfig } from './config/index.js';
import { validateReadOnly, injectRowLimit, redactTableSchema, redactQueryResult } from './utils/index.js';
```

- [ ] **Step 2: 改 `describe_table` handler**

找到 `describe_table` 工具的 handler（当前签名 `async ({ database, table, schema = 'dbo' }) => {`），把函数体里的 try 块：

```ts
    try {
      const tableSchema = await dbProvider.describeTable(database, table, schema);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(tableSchema, null, 2),
          },
        ],
      };
    } catch (error: any) {
```

改为（`const` → `let`，插入脱敏块）：

```ts
    try {
      let tableSchema = await dbProvider.describeTable(database, table, schema);

      // Sensitive column redaction: remove hit columns entirely
      const { enabled, matchSet } = getSensitiveConfig();
      if (enabled) {
        tableSchema = redactTableSchema(tableSchema, matchSet);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(tableSchema, null, 2),
          },
        ],
      };
    } catch (error: any) {
```

- [ ] **Step 3: 改 `execute_query` handler**

找到 `execute_query` 工具 handler 里执行查询后的 try 块：

```ts
    try {
      const result = await dbProvider.executeQuery(limitedQuery, database);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
```

改为：

```ts
    try {
      let result = await dbProvider.executeQuery(limitedQuery, database);

      // Sensitive column redaction: remove hit columns from result
      const { enabled, matchSet } = getSensitiveConfig();
      if (enabled) {
        result = redactQueryResult(result, matchSet);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
```

- [ ] **Step 4: 编译确认无类型错误**

Run:
```bash
cd database
npm run build
```
Expected: `tsc` 无错误退出（exit 0）。

- [ ] **Step 5: 重跑脱敏单测确认集成未破坏纯函数**

Run:
```bash
npx tsx tests/test-column-redactor.ts
```
Expected: 全部 PASS。

- [ ] **Step 6: 提交**

```bash
cd database
git add src/index.ts
git commit -m "feat(index): integrate sensitive column redaction into describe_table and execute_query"
```

---

## Task 4: 测试脚本与文档

**Files:**
- Modify: `database/package.json:25`（scripts 区块）
- Modify: `database/.env.example`
- Modify: `database/README.md`

- [ ] **Step 1: 在 `package.json` 新增测试脚本**

Modify `database/package.json` 的 `scripts` 块，在 `"test:oceanbase"` 行之后追加：

```json
    "test:sensitive": "npx tsx tests/test-column-redactor.ts",
```

（最终 scripts 块相关部分：）
```json
  "scripts": {
    "build": "tsc",
    "dev": "tsc && node dist/index.js",
    "start": "node dist/index.js",
    "watch": "tsc --watch",
    "sync-skill": "node scripts/sync-skill.mjs",
    "test": "npx tsx tests/test-mcp-methods.ts",
    "test:sqlserver": "npx tsx tests/test-mcp-methods-sqlserver.ts",
    "test:mysql": "npx tsx tests/test-mysql.ts",
    "test:oceanbase": "npx tsx tests/test-oceanbase.ts",
    "test:sensitive": "npx tsx tests/test-column-redactor.ts",
    "prepublishOnly": "npm run sync-skill && npm run build",
    "version": "git add . && git commit -m \"chore: bump version to %s\"",
    "postversion": "git push --follow-tags"
  },
```

- [ ] **Step 2: 验证脚本可运行**

Run:
```bash
cd database
npm run test:sensitive
```
Expected: 全部测试 PASS。

- [ ] **Step 3: 更新 `.env.example`**

Modify `database/.env.example`，在文件**末尾**追加：

```env

# =============================================================================
# Sensitive Column Redaction
# =============================================================================
# Comma-separated list of additional sensitive column names to redact from
# describe_table and execute_query results (matched case-insensitively).
# These are MERGED with a builtin list (password, pwd, id_card, phone, email,
# bank_card, etc.) - you only need to add your business-specific columns.
# Hit columns are removed entirely (name + data) from MCP tool output.
# Leave empty to use only the builtin list.
# Example: DB_SENSITIVE_COLUMNS=user_secret,salary,home_address
# DB_SENSITIVE_COLUMNS=
```

- [ ] **Step 4: 更新 `README.md` 配置表**

Modify `database/README.md`。在通用变量配置表里，`DB_TRUST_SERVER_CERTIFICATE` 那一行**之后**追加一行：

```markdown
| `DB_SENSITIVE_COLUMNS`          | 否   | (空，仅用内置名单)        | 敏感字段列表（逗号分隔），命中则从 `describe_table` / `execute_query` 结果中整列删除。与内置名单合并 |
```

- [ ] **Step 5: 更新 `README.md` 安全说明**

Modify `database/README.md` 的 `## 安全说明` 章节。在现有 4 条 bullet 之后（`- 建议为 MCP 创建**最小权限专用账号**...` 之后）追加：

```markdown
- **敏感字段脱敏**：内置常见敏感字段名单（`password` / `pwd` / `token` / `id_card` / `phone` / `email` / `bank_card` 等），命中字段时从 `describe_table` 和 `execute_query` 的返回结果中**整列删除**（字段名与数据都不出现）。通过 `DB_SENSITIVE_COLUMNS` 环境变量追加业务特有字段（逗号分隔，与内置名单合并，大小写不敏感精确匹配）。注意：匹配按**输出列名**进行，`SELECT password AS pwd` 别名查询会按别名 `pwd` 匹配
```

- [ ] **Step 6: 提交**

```bash
cd database
git add package.json .env.example README.md
git commit -m "docs: add DB_SENSITIVE_COLUMNS config and sensitive redaction docs"
```

---

## Task 5: 全量验证

- [ ] **Step 1: 清理编译产物并重新编译**

Run:
```bash
cd database
rm -rf dist
npm run build
```
Expected: 编译成功，`dist/` 重新生成，无 TS 错误。

- [ ] **Step 2: 运行脱敏单测**

Run:
```bash
npm run test:sensitive
```
Expected: 全部 PASS，`0 failed`。

- [ ] **Step 3: 运行 SQL 安全单测（确认未破坏既有逻辑）**

Run:
```bash
npx tsx tests/test-sql-safety.ts
```
Expected: 全部 PASS（这些测试不受影响，作为回归验证）。

- [ ] **Step 4: 手动冒烟测试（可选，需数据库连接）**

如本地有可连接的数据库，设置 `DB_SENSITIVE_COLUMNS` 并启动 server，通过 MCP client 调用 `describe_table` 和 `execute_query`，确认含敏感列名的结果中该列已消失。若无可连数据库，跳过此步。

- [ ] **Step 5: 最终提交（如有剩余改动）**

```bash
cd database
git status
# 如有未提交改动：
git add -A
git commit -m "chore: rebuild dist after sensitive column redaction feature"
```

---

## Self-Review Checklist（计划作者自检，执行者无需操作）

- **Spec 覆盖**：
  - ✓ 配置（内置名单 + 环境变量 + 合并）→ Task 1
  - ✓ `redactTableSchema`（含联动删主键）→ Task 2
  - ✓ `redactQueryResult`（含零拷贝、整表敏感）→ Task 2
  - ✓ `describe_table` 集成 → Task 3
  - ✓ `execute_query` 集成（执行顺序：只读→行限→查询→脱敏）→ Task 3
  - ✓ 边界：大小写不敏感、别名按输出列名、整表敏感返回空结构、无命中零拷贝 → Task 2 测试覆盖
  - ✓ 文档：README 配置表 + 安全说明、.env.example → Task 4
  - ✓ 测试脚本 → Task 4

- **占位符扫描**：无 TBD/TODO，所有代码块完整 ✓

- **类型一致性**：`SensitiveConfig.enabled/columns/matchSet`、`redactTableSchema(schema, matchSet)`、`redactQueryResult(result, matchSet)` 在 Task 1-3 中签名一致 ✓
