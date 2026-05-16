/**
 * SQL Safety Check Unit Tests
 *
 * Tests for sql-parser, readonly-check, and sql-row-limiter modules.
 * Run with: npx tsx tests/test-sql-safety.ts
 */

import { stripCommentsAndStrings, splitStatements } from '../src/utils/sql-parser.js';
import { isReadOnlyStatement, validateReadOnly } from '../src/utils/readonly-check.js';
import { injectRowLimit } from '../src/utils/sql-row-limiter.js';
import { DatabaseType } from '../src/config/base.js';

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
// SQL Parser Tests
// ============================================================
console.log('\n=== SQL Parser: stripCommentsAndStrings ===\n');

// Single-line comments
{
    const result = stripCommentsAndStrings('SELECT 1 -- comment', DatabaseType.SQLSERVER);
    assert(!result.includes('comment'), 'strips single-line comment');
    assert(result.includes('SELECT 1'), 'preserves SQL before comment');
}

// Multi-line comments
{
    const result = stripCommentsAndStrings('SELECT /* DROP TABLE */ 1', DatabaseType.SQLSERVER);
    assert(!result.includes('DROP'), 'strips multi-line comment content');
    assert(result.includes('SELECT') && result.includes('1'), 'preserves SQL around comment');
}

// String literal content cleared
{
    const result = stripCommentsAndStrings("WHERE x = 'DELETE this'", DatabaseType.SQLSERVER);
    assert(!result.includes('DELETE'), 'strips string literal content');
    assert(result.includes('WHERE') && result.includes('x'), 'preserves SQL structure');
}

// Escaped quotes in strings
{
    const result = stripCommentsAndStrings("SELECT 'it''s fine'", DatabaseType.SQLSERVER);
    assert(!result.includes('fine'), 'handles escaped quotes correctly');
}

// MySQL backslash escape in strings
{
    const result = stripCommentsAndStrings("SELECT 'can\\'t stop'", DatabaseType.MYSQL);
    assert(!result.includes('stop'), 'handles MySQL backslash escape');
}

// MySQL backtick identifiers preserved
{
    const result = stripCommentsAndStrings('SELECT `update` FROM t', DatabaseType.MYSQL);
    assert(result.includes('`update`'), 'preserves MySQL backtick identifiers');
}

// SQL Server bracket identifiers preserved
{
    const result = stripCommentsAndStrings('SELECT [drop] FROM t', DatabaseType.SQLSERVER);
    assert(result.includes('[drop]'), 'preserves SQL Server bracket identifiers');
}

// Double-quote identifiers preserved
{
    const result = stripCommentsAndStrings('SELECT "delete" FROM t', DatabaseType.SQLSERVER);
    assert(result.includes('"delete"'), 'preserves double-quote identifiers');
}

// Comment inside string should NOT strip
{
    const result = stripCommentsAndStrings("SELECT '-- not a comment'", DatabaseType.MYSQL);
    assert(!result.includes('not a comment'), 'string content with -- is stripped as string content');
}

console.log('\n=== SQL Parser: splitStatements ===\n');

// Simple multi-statement
{
    const result = splitStatements('SELECT 1; SELECT 2', DatabaseType.SQLSERVER);
    assertEqual(result.length, 2, 'splits two statements by semicolon');
    assertEqual(result[0], 'SELECT 1', 'first statement correct');
    assertEqual(result[1], 'SELECT 2', 'second statement correct');
}

// Semicolons in string literals
{
    const result = splitStatements("SELECT 'a;b'", DatabaseType.MYSQL);
    assertEqual(result.length, 1, 'does not split on semicolons inside strings');
}

// Semicolons in comments
{
    const result = splitStatements("SELECT 1 -- ; comment\nSELECT 2", DatabaseType.SQLSERVER);
    // The -- makes rest of line a comment, so the ; is inside the comment
    // The newline ends the comment, then SELECT 2 is in the same statement (no semicolon separator)
    // Actually there's no semicolon at depth 0, so it should be 1 statement
    assertEqual(result.length, 1, 'does not split on semicolons inside single-line comments');
}

// Trailing semicolons
{
    const result = splitStatements('SELECT 1;', DatabaseType.SQLSERVER);
    assertEqual(result.length, 1, 'handles trailing semicolons');
}

// Multiple semicolons between statements
{
    const result = splitStatements('SELECT 1;; SELECT 2', DatabaseType.SQLSERVER);
    assertEqual(result.length, 2, 'handles double semicolons');
}

// No semicolons
{
    const result = splitStatements('SELECT 1', DatabaseType.SQLSERVER);
    assertEqual(result.length, 1, 'handles no semicolons');
}

// ============================================================
// Readonly Checker Tests
// ============================================================
console.log('\n=== Readonly Check: Allowed Queries ===\n');

// Basic allowed queries
{
    const r1 = isReadOnlyStatement('SELECT * FROM users', DatabaseType.SQLSERVER);
    assert(r1.safe, 'allows basic SELECT');

    const r2 = isReadOnlyStatement('WITH cte AS (SELECT 1) SELECT * FROM cte', DatabaseType.SQLSERVER);
    assert(r2.safe, 'allows WITH...SELECT');

    const r3 = isReadOnlyStatement('EXPLAIN SELECT * FROM users', DatabaseType.MYSQL);
    assert(r3.safe, 'allows EXPLAIN (MySQL)');

    const r4 = isReadOnlyStatement('SHOW TABLES', DatabaseType.MYSQL);
    assert(r4.safe, 'allows SHOW (MySQL)');

    const r5 = isReadOnlyStatement('DESCRIBE users', DatabaseType.MYSQL);
    assert(r5.safe, 'allows DESCRIBE (MySQL)');

    const r6 = isReadOnlyStatement('DESC users', DatabaseType.OCEANBASE);
    assert(r6.safe, 'allows DESC (OceanBase)');
}

console.log('\n=== Readonly Check: Blocked Queries ===\n');

// Basic blocked queries
{
    const r1 = isReadOnlyStatement('INSERT INTO users VALUES (1)', DatabaseType.SQLSERVER);
    assert(!r1.safe, 'blocks INSERT');

    const r2 = isReadOnlyStatement('UPDATE users SET name = "x"', DatabaseType.SQLSERVER);
    assert(!r2.safe, 'blocks UPDATE');

    const r3 = isReadOnlyStatement('DELETE FROM users', DatabaseType.MYSQL);
    assert(!r3.safe, 'blocks DELETE');

    const r4 = isReadOnlyStatement('DROP TABLE users', DatabaseType.SQLSERVER);
    assert(!r4.safe, 'blocks DROP');

    const r5 = isReadOnlyStatement('CREATE TABLE t (id INT)', DatabaseType.MYSQL);
    assert(!r5.safe, 'blocks CREATE');

    const r6 = isReadOnlyStatement('ALTER TABLE users ADD col INT', DatabaseType.SQLSERVER);
    assert(!r6.safe, 'blocks ALTER');

    const r7 = isReadOnlyStatement('TRUNCATE TABLE users', DatabaseType.MYSQL);
    assert(!r7.safe, 'blocks TRUNCATE');

    const r8 = isReadOnlyStatement('EXEC sp_help', DatabaseType.SQLSERVER);
    assert(!r8.safe, 'blocks EXEC');

    const r9 = isReadOnlyStatement('SET NOCOUNT ON', DatabaseType.SQLSERVER);
    assert(!r9.safe, 'blocks SET');
}

console.log('\n=== Readonly Check: Bypass Prevention ===\n');

// Comment bypass attempt
{
    const r1 = isReadOnlyStatement('/* SELECT */ DELETE FROM t', DatabaseType.SQLSERVER);
    assert(!r1.safe, 'blocks comment-prefixed DELETE');
}

// String content false positive prevention
{
    const r1 = isReadOnlyStatement("SELECT * FROM t WHERE note = 'DELETE me'", DatabaseType.SQLSERVER);
    assert(r1.safe, 'allows SELECT with DELETE in string literal');

    const r2 = isReadOnlyStatement("SELECT * FROM t WHERE x = 'DROP TABLE'", DatabaseType.MYSQL);
    assert(r2.safe, 'allows SELECT with DROP in string literal');
}

// Multi-statement injection
{
    const r1 = validateReadOnly('SELECT 1; DROP TABLE t', DatabaseType.SQLSERVER);
    assert(!r1.safe, 'blocks multi-statement injection');

    const r2 = validateReadOnly('SELECT 1; DELETE FROM users', DatabaseType.MYSQL);
    assert(!r2.safe, 'blocks multi-statement DELETE injection');
}

// SELECT INTO
{
    const r1 = isReadOnlyStatement('SELECT * INTO newtable FROM users', DatabaseType.SQLSERVER);
    assert(!r1.safe, 'blocks SELECT INTO (creates table)');

    const r2 = isReadOnlyStatement('SELECT @v = col FROM users', DatabaseType.SQLSERVER);
    assert(r2.safe, 'allows SELECT with variable assignment');
}

// SELECT INTO OUTFILE (MySQL)
{
    const r1 = isReadOnlyStatement("SELECT * INTO OUTFILE '/tmp/data.csv' FROM users", DatabaseType.MYSQL);
    assert(!r1.safe, 'blocks SELECT INTO OUTFILE (MySQL)');
}

// CTE with mutation
{
    const r1 = isReadOnlyStatement('WITH cte AS (SELECT * FROM users) DELETE FROM cte WHERE id = 1', DatabaseType.SQLSERVER);
    assert(!r1.safe, 'blocks CTE with DELETE');

    const r2 = isReadOnlyStatement('WITH cte AS (SELECT * FROM users) INSERT INTO backup SELECT * FROM cte', DatabaseType.SQLSERVER);
    assert(!r2.safe, 'blocks CTE with INSERT');
}

// SQL Server dangerous patterns
{
    const r1 = isReadOnlyStatement("SELECT * FROM OPENROWSET('SQLNCLI', ...)", DatabaseType.SQLSERVER);
    assert(!r1.safe, 'blocks OPENROWSET');

    const r2 = isReadOnlyStatement("SELECT * FROM OPENDATASOURCE('SQLNCLI', ...)", DatabaseType.SQLSERVER);
    assert(!r2.safe, 'blocks OPENDATASOURCE');
}

// Case insensitivity
{
    const r1 = isReadOnlyStatement('select * from users', DatabaseType.SQLSERVER);
    assert(r1.safe, 'allows lowercase select');

    const r2 = isReadOnlyStatement('Select * From Users', DatabaseType.SQLSERVER);
    assert(r2.safe, 'allows mixed-case Select');
}

// Leading whitespace
{
    const r1 = isReadOnlyStatement('  \n  SELECT 1', DatabaseType.SQLSERVER);
    assert(r1.safe, 'allows leading whitespace before SELECT');
}

// ============================================================
// SQL Row Limiter Tests
// ============================================================
console.log('\n=== SQL Row Limiter: SQL Server (TOP) ===\n');

// No existing TOP
{
    const result = injectRowLimit('SELECT * FROM users', DatabaseType.SQLSERVER, 1000);
    assert(result.toUpperCase().includes('TOP 1000'), 'injects TOP when none exists');
    assert(result.toUpperCase().includes('SELECT'), 'preserves SELECT');
}

// With DISTINCT
{
    const result = injectRowLimit('SELECT DISTINCT name FROM users', DatabaseType.SQLSERVER, 1000);
    const upper = result.toUpperCase();
    assert(upper.includes('TOP 1000'), 'injects TOP with DISTINCT');
    assert(upper.indexOf('DISTINCT') < upper.indexOf('TOP'), 'DISTINCT comes before TOP');
}

// Existing TOP smaller
{
    const result = injectRowLimit('SELECT TOP 5 * FROM users', DatabaseType.SQLSERVER, 1000);
    assert(result.includes('5'), 'preserves smaller existing TOP');
    assert(!result.includes('1000'), 'does not inject larger TOP');
}

// Existing TOP larger
{
    const result = injectRowLimit('SELECT TOP 5000 * FROM users', DatabaseType.SQLSERVER, 1000);
    assert(result.includes('1000'), 'replaces larger TOP with maxRows');
    assert(!result.includes('5000'), 'removes original larger TOP value');
}

console.log('\n=== SQL Row Limiter: MySQL/OceanBase (LIMIT) ===\n');

// No existing LIMIT
{
    const result = injectRowLimit('SELECT * FROM users', DatabaseType.MYSQL, 1000);
    assert(result.toUpperCase().includes('LIMIT 1000'), 'appends LIMIT when none exists');
}

// Existing LIMIT smaller
{
    const result = injectRowLimit('SELECT * FROM users LIMIT 5', DatabaseType.MYSQL, 1000);
    assert(result.includes('5'), 'preserves smaller existing LIMIT');
    assert(!result.includes('1000'), 'does not override with larger LIMIT');
}

// Existing LIMIT larger
{
    const result = injectRowLimit('SELECT * FROM users LIMIT 5000', DatabaseType.MYSQL, 1000);
    assert(result.includes('1000'), 'replaces larger LIMIT with maxRows');
    assert(!result.includes('5000'), 'removes original larger LIMIT value');
}

// OceanBase same as MySQL
{
    const result = injectRowLimit('SELECT * FROM orders', DatabaseType.OCEANBASE, 500);
    assert(result.toUpperCase().includes('LIMIT 500'), 'appends LIMIT for OceanBase');
}

// Non-SELECT statements not modified
{
    const result = injectRowLimit('SHOW TABLES', DatabaseType.MYSQL, 1000);
    assertEqual(result, 'SHOW TABLES', 'does not modify SHOW statement');
}

// WITH...SELECT gets limit injected
{
    const result = injectRowLimit('WITH cte AS (SELECT 1) SELECT * FROM cte', DatabaseType.MYSQL, 100);
    assert(result.toUpperCase().includes('LIMIT 100'), 'injects LIMIT for WITH...SELECT in MySQL');
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
