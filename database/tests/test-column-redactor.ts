/**
 * Sensitive Column Redaction Unit Tests
 *
 * Tests for getSensitiveConfig, redactTableSchema, redactQueryResult.
 * Run with: npx tsx tests/test-column-redactor.ts
 */

import { getSensitiveConfig, BUILTIN_SENSITIVE_COLUMNS } from '../src/config/base.js';
import { redactTableSchema, redactQueryResult } from '../src/utils/column-redactor.js';
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
    // builtin password + user password + user PASSWORD = 3 entries
    const passwordEntries = cfg.columns.filter(c => c.toLowerCase() === 'password');
    assertEqual(passwordEntries.length, 3, 'preserves original-case duplicates in columns array');
    // matchSet 去重
    assert(cfg.matchSet.has('password'), 'matchSet has password (deduped, case-insensitive)');
    if (saved !== undefined) process.env.DB_SENSITIVE_COLUMNS = saved;
    else delete process.env.DB_SENSITIVE_COLUMNS;
}

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

// ============================================================
// Summary
// ============================================================
console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('='.repeat(50));

if (failed > 0) {
    process.exit(1);
}