/**
 * Readonly SQL Checker
 *
 * Validates SQL statements against a whitelist of allowed keywords per database type.
 * Uses preprocessed SQL (comments/strings stripped) for reliable keyword detection.
 */

import { DatabaseType } from '../config/base.js';
import { SafetyCheckResult } from '../types/index.js';
import { stripCommentsAndStrings, splitStatements } from './sql-parser.js';

/**
 * Allowed first keywords per database type (whitelist approach)
 */
const ALLOWED_KEYWORDS: Record<DatabaseType, string[]> = {
    [DatabaseType.SQLSERVER]: ['SELECT', 'WITH', 'EXPLAIN', 'SHOWPLAN'],
    [DatabaseType.MYSQL]: ['SELECT', 'WITH', 'EXPLAIN', 'SHOW', 'DESCRIBE', 'DESC'],
    [DatabaseType.OCEANBASE]: ['SELECT', 'WITH', 'EXPLAIN', 'SHOW', 'DESCRIBE', 'DESC'],
};

/**
 * Mutating keywords that should not appear as the main operation in a CTE
 */
const MUTATING_KEYWORDS = [
    'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE',
    'TRUNCATE', 'MERGE', 'GRANT', 'REVOKE', 'RENAME', 'EXEC', 'EXECUTE',
];

/**
 * Dangerous functions/patterns in SQL Server that can execute arbitrary code
 */
const SQLSERVER_DANGEROUS_PATTERNS = [
    'OPENROWSET', 'OPENDATASOURCE', 'XP_CMDSHELL', 'SP_EXECUTESQL',
    'XP_REGREAD', 'XP_REGWRITE', 'XP_FILEEXIST', 'XP_DIRTREE',
];

/**
 * Check if a single SQL statement is read-only
 */
export function isReadOnlyStatement(sql: string, dbType: DatabaseType): SafetyCheckResult {
    const stripped = stripCommentsAndStrings(sql, dbType);
    const normalized = stripped.replace(/\s+/g, ' ').trim().toUpperCase();

    // Empty statement is safe
    if (normalized.length === 0) {
        return { safe: true };
    }

    // Extract first keyword
    const firstWord = normalized.split(/\s/)[0];

    // Check against whitelist
    const allowed = ALLOWED_KEYWORDS[dbType];
    if (!allowed.includes(firstWord)) {
        return {
            safe: false,
            reason: `Statement type '${firstWord}' is not allowed. Only read-only operations are permitted.`,
        };
    }

    // SELECT INTO detection
    if (firstWord === 'SELECT') {
        const selectIntoCheck = checkSelectInto(normalized, dbType);
        if (!selectIntoCheck.safe) {
            return selectIntoCheck;
        }
    }

    // CTE (WITH) body mutation detection
    if (firstWord === 'WITH') {
        const cteCheck = checkCTEMutation(normalized);
        if (!cteCheck.safe) {
            return cteCheck;
        }
    }

    // SQL Server specific dangerous function checks
    if (dbType === DatabaseType.SQLSERVER) {
        const dangerCheck = checkSqlServerDangerousPatterns(normalized);
        if (!dangerCheck.safe) {
            return dangerCheck;
        }
    }

    return { safe: true };
}

/**
 * Validate that all statements in a SQL string are read-only.
 * Splits multi-statement SQL and checks each individually.
 */
export function validateReadOnly(sql: string, dbType: DatabaseType): SafetyCheckResult {
    const statements = splitStatements(sql, dbType);

    if (statements.length === 0) {
        return { safe: true };
    }

    for (let i = 0; i < statements.length; i++) {
        const result = isReadOnlyStatement(statements[i], dbType);
        if (!result.safe) {
            if (statements.length > 1) {
                return {
                    safe: false,
                    reason: `Statement ${i + 1}: ${result.reason}`,
                };
            }
            return result;
        }
    }

    return { safe: true };
}

/**
 * Check for SELECT INTO patterns that create tables or write files
 */
function checkSelectInto(normalized: string, dbType: DatabaseType): SafetyCheckResult {
    if (dbType === DatabaseType.SQLSERVER) {
        // SQL Server: SELECT ... INTO tablename (creates a new table)
        // But SELECT ... INTO @variable is safe (variable assignment)
        const intoMatch = normalized.match(/\bINTO\s+([^\s,]+)/);
        if (intoMatch) {
            const target = intoMatch[1];
            // Variables start with @, table variables start with @, temp tables start with #
            if (!target.startsWith('@') && !target.startsWith('#')) {
                return {
                    safe: false,
                    reason: `SELECT INTO '${target}' is not allowed as it creates a new table.`,
                };
            }
        }
    } else {
        // MySQL/OceanBase: SELECT ... INTO OUTFILE/DUMPFILE
        if (/\bINTO\s+(OUTFILE|DUMPFILE)\b/.test(normalized)) {
            return {
                safe: false,
                reason: 'SELECT INTO OUTFILE/DUMPFILE is not allowed as it writes to the file system.',
            };
        }
    }

    return { safe: true };
}

/**
 * Check CTE (WITH) statements for mutation operations.
 * A CTE like `WITH cte AS (...) DELETE FROM ...` should be blocked.
 */
function checkCTEMutation(normalized: string): SafetyCheckResult {
    // Find the terminal statement after the CTE definitions
    // Strategy: find the last top-level keyword after balanced parentheses
    const terminalKeyword = extractCTETerminalKeyword(normalized);

    if (terminalKeyword && MUTATING_KEYWORDS.includes(terminalKeyword)) {
        return {
            safe: false,
            reason: `CTE with '${terminalKeyword}' operation is not allowed. Only SELECT is permitted after WITH clause.`,
        };
    }

    return { safe: true };
}

/**
 * Extract the terminal (main) keyword after CTE definitions in a WITH statement.
 *
 * Pattern: WITH name AS (...), name2 AS (...) <TERMINAL_KEYWORD> ...
 */
function extractCTETerminalKeyword(normalized: string): string | null {
    // Skip past "WITH" keyword
    let pos = 4; // length of "WITH"
    const len = normalized.length;
    let depth = 0;

    // Walk through the CTE definitions, tracking parenthesis depth
    while (pos < len) {
        const ch = normalized[pos];

        if (ch === '(') {
            depth++;
            pos++;
        } else if (ch === ')') {
            depth--;
            pos++;
            // After closing a top-level CTE parenthesis, look for comma or terminal keyword
            if (depth === 0) {
                // Skip whitespace
                while (pos < len && /\s/.test(normalized[pos])) pos++;
                if (pos >= len) return null;

                if (normalized[pos] === ',') {
                    // Another CTE definition follows
                    pos++;
                    continue;
                }

                // This should be the terminal keyword
                const remaining = normalized.slice(pos);
                const match = remaining.match(/^([A-Z_]+)/);
                return match ? match[1] : null;
            }
        } else {
            pos++;
        }
    }

    return null;
}

/**
 * Check for dangerous SQL Server functions/patterns
 */
function checkSqlServerDangerousPatterns(normalized: string): SafetyCheckResult {
    for (const pattern of SQLSERVER_DANGEROUS_PATTERNS) {
        if (normalized.includes(pattern)) {
            return {
                safe: false,
                reason: `Usage of '${pattern}' is not allowed for security reasons.`,
            };
        }
    }
    return { safe: true };
}
