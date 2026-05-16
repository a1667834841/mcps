/**
 * SQL Parser - Comment/String stripping and statement splitting
 *
 * Uses a state machine to properly handle SQL dialects including
 * comments, string literals, and identifier quoting styles.
 */

import { DatabaseType } from '../config/base.js';

/**
 * Parser states for the state machine
 */
const enum ParserState {
    NORMAL,
    SINGLE_LINE_COMMENT,
    MULTI_LINE_COMMENT,
    SINGLE_QUOTE_STRING,
    DOUBLE_QUOTE_ID,
    BACKTICK_ID,
    BRACKET_ID,
}

/**
 * Check if the database type uses backtick identifiers
 */
function usesBackticks(dbType: DatabaseType): boolean {
    return dbType === DatabaseType.MYSQL || dbType === DatabaseType.OCEANBASE;
}

/**
 * Check if the database type uses bracket identifiers
 */
function usesBrackets(dbType: DatabaseType): boolean {
    return dbType === DatabaseType.SQLSERVER;
}

/**
 * Check if the database type supports backslash escapes in strings
 */
function usesBackslashEscape(dbType: DatabaseType): boolean {
    return dbType === DatabaseType.MYSQL || dbType === DatabaseType.OCEANBASE;
}

/**
 * Strip comments and string literal contents from SQL.
 *
 * - Single-line comments (--) → replaced with space
 * - Multi-line comments are replaced with space
 * - String literal contents are emptied (preserving the quotes as '')
 * - Identifier quoting (", `, []) is preserved as-is
 *
 * This allows downstream keyword matching without false positives
 * from string content or comments.
 */
export function stripCommentsAndStrings(sql: string, dbType: DatabaseType): string {
    const result: string[] = [];
    let state: ParserState = ParserState.NORMAL;
    let i = 0;
    const len = sql.length;

    while (i < len) {
        const ch = sql[i];
        const next = i + 1 < len ? sql[i + 1] : '';

        switch (state) {
            case ParserState.NORMAL:
                if (ch === '-' && next === '-') {
                    // Enter single-line comment
                    state = ParserState.SINGLE_LINE_COMMENT;
                    result.push(' ');
                    i += 2;
                } else if (ch === '/' && next === '*') {
                    // Enter multi-line comment
                    state = ParserState.MULTI_LINE_COMMENT;
                    result.push(' ');
                    i += 2;
                } else if (ch === "'") {
                    // Enter string literal - output empty placeholder
                    state = ParserState.SINGLE_QUOTE_STRING;
                    result.push("''");
                    i += 1;
                } else if (ch === '"') {
                    // Enter double-quote identifier
                    state = ParserState.DOUBLE_QUOTE_ID;
                    result.push(ch);
                    i += 1;
                } else if (ch === '`' && usesBackticks(dbType)) {
                    // Enter backtick identifier (MySQL/OceanBase)
                    state = ParserState.BACKTICK_ID;
                    result.push(ch);
                    i += 1;
                } else if (ch === '[' && usesBrackets(dbType)) {
                    // Enter bracket identifier (SQL Server)
                    state = ParserState.BRACKET_ID;
                    result.push(ch);
                    i += 1;
                } else {
                    result.push(ch);
                    i += 1;
                }
                break;

            case ParserState.SINGLE_LINE_COMMENT:
                if (ch === '\n') {
                    state = ParserState.NORMAL;
                    result.push('\n');
                }
                i += 1;
                break;

            case ParserState.MULTI_LINE_COMMENT:
                if (ch === '*' && next === '/') {
                    state = ParserState.NORMAL;
                    i += 2;
                } else {
                    i += 1;
                }
                break;

            case ParserState.SINGLE_QUOTE_STRING:
                if (ch === "'" && next === "'") {
                    // Escaped quote ('') - skip both
                    i += 2;
                } else if (ch === '\\' && usesBackslashEscape(dbType) && next === "'") {
                    // Backslash escape (\') in MySQL/OceanBase - skip both
                    i += 2;
                } else if (ch === "'") {
                    // End of string
                    state = ParserState.NORMAL;
                    i += 1;
                } else {
                    // Skip string content
                    i += 1;
                }
                break;

            case ParserState.DOUBLE_QUOTE_ID:
                if (ch === '"' && next === '"') {
                    // Escaped double quote
                    result.push('""');
                    i += 2;
                } else if (ch === '"') {
                    // End of identifier
                    state = ParserState.NORMAL;
                    result.push(ch);
                    i += 1;
                } else {
                    result.push(ch);
                    i += 1;
                }
                break;

            case ParserState.BACKTICK_ID:
                if (ch === '`') {
                    // End of backtick identifier
                    state = ParserState.NORMAL;
                    result.push(ch);
                    i += 1;
                } else {
                    result.push(ch);
                    i += 1;
                }
                break;

            case ParserState.BRACKET_ID:
                if (ch === ']') {
                    // End of bracket identifier
                    state = ParserState.NORMAL;
                    result.push(ch);
                    i += 1;
                } else {
                    result.push(ch);
                    i += 1;
                }
                break;
        }
    }

    return result.join('');
}

/**
 * Split SQL into individual statements by semicolons,
 * respecting quoted contexts (strings, comments, identifiers).
 *
 * Returns trimmed, non-empty statements from the original SQL.
 */
export function splitStatements(sql: string, dbType: DatabaseType): string[] {
    const splitPoints: number[] = [];
    let state: ParserState = ParserState.NORMAL;
    let i = 0;
    const len = sql.length;

    while (i < len) {
        const ch = sql[i];
        const next = i + 1 < len ? sql[i + 1] : '';

        switch (state) {
            case ParserState.NORMAL:
                if (ch === ';') {
                    splitPoints.push(i);
                    i += 1;
                } else if (ch === '-' && next === '-') {
                    state = ParserState.SINGLE_LINE_COMMENT;
                    i += 2;
                } else if (ch === '/' && next === '*') {
                    state = ParserState.MULTI_LINE_COMMENT;
                    i += 2;
                } else if (ch === "'") {
                    state = ParserState.SINGLE_QUOTE_STRING;
                    i += 1;
                } else if (ch === '"') {
                    state = ParserState.DOUBLE_QUOTE_ID;
                    i += 1;
                } else if (ch === '`' && usesBackticks(dbType)) {
                    state = ParserState.BACKTICK_ID;
                    i += 1;
                } else if (ch === '[' && usesBrackets(dbType)) {
                    state = ParserState.BRACKET_ID;
                    i += 1;
                } else {
                    i += 1;
                }
                break;

            case ParserState.SINGLE_LINE_COMMENT:
                if (ch === '\n') {
                    state = ParserState.NORMAL;
                }
                i += 1;
                break;

            case ParserState.MULTI_LINE_COMMENT:
                if (ch === '*' && next === '/') {
                    state = ParserState.NORMAL;
                    i += 2;
                } else {
                    i += 1;
                }
                break;

            case ParserState.SINGLE_QUOTE_STRING:
                if (ch === "'" && next === "'") {
                    i += 2;
                } else if (ch === '\\' && usesBackslashEscape(dbType) && next === "'") {
                    i += 2;
                } else if (ch === "'") {
                    state = ParserState.NORMAL;
                    i += 1;
                } else {
                    i += 1;
                }
                break;

            case ParserState.DOUBLE_QUOTE_ID:
                if (ch === '"' && next === '"') {
                    i += 2;
                } else if (ch === '"') {
                    state = ParserState.NORMAL;
                    i += 1;
                } else {
                    i += 1;
                }
                break;

            case ParserState.BACKTICK_ID:
                if (ch === '`') {
                    state = ParserState.NORMAL;
                }
                i += 1;
                break;

            case ParserState.BRACKET_ID:
                if (ch === ']') {
                    state = ParserState.NORMAL;
                }
                i += 1;
                break;
        }
    }

    // Split original SQL at the identified split points
    const statements: string[] = [];
    let start = 0;
    for (const pos of splitPoints) {
        const segment = sql.slice(start, pos).trim();
        if (segment.length > 0) {
            statements.push(segment);
        }
        start = pos + 1;
    }
    // Last segment after final semicolon (or entire string if no semicolons)
    const last = sql.slice(start).trim();
    if (last.length > 0) {
        statements.push(last);
    }

    return statements;
}
