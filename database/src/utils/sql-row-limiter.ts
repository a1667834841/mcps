/**
 * SQL Row Limiter
 *
 * Injects or adjusts SQL-level row limiting clauses (TOP/LIMIT)
 * BEFORE execution, so the database itself enforces the limit.
 */

import { DatabaseType } from '../config/base.js';
import { stripCommentsAndStrings } from './sql-parser.js';

/**
 * Inject or adjust row limit in SQL statement.
 *
 * - SQL Server: uses TOP N
 * - MySQL/OceanBase: uses LIMIT N
 *
 * Only modifies SELECT statements. SHOW/DESCRIBE/EXPLAIN are not modified.
 */
export function injectRowLimit(sql: string, dbType: DatabaseType, maxRows: number): string {
    if (maxRows <= 0) {
        return sql;
    }

    const stripped = stripCommentsAndStrings(sql, dbType);
    const normalized = stripped.replace(/\s+/g, ' ').trim().toUpperCase();

    // Only inject limits for SELECT and WITH...SELECT statements
    const firstWord = normalized.split(/\s/)[0];
    if (firstWord !== 'SELECT' && firstWord !== 'WITH') {
        return sql;
    }

    if (dbType === DatabaseType.SQLSERVER) {
        return injectTopN(sql, stripped, maxRows);
    } else {
        return injectLimit(sql, stripped, maxRows);
    }
}

/**
 * SQL Server: Inject or adjust TOP N clause
 */
function injectTopN(sql: string, stripped: string, maxRows: number): string {
    const normalizedStripped = stripped.toUpperCase();

    // Find the outermost SELECT position (for WITH statements, find the final SELECT)
    const selectPos = findOuterSelectPosition(normalizedStripped);
    if (selectPos === -1) {
        return sql;
    }

    // Look for existing TOP after the SELECT keyword
    const afterSelect = normalizedStripped.slice(selectPos + 6); // "SELECT".length = 6
    const topMatch = afterSelect.match(/^\s+(?:DISTINCT\s+|ALL\s+)?TOP\s+(\d+)/);

    if (topMatch) {
        const existingTop = parseInt(topMatch[1], 10);
        if (existingTop <= maxRows) {
            // Existing TOP is already within limit
            return sql;
        }

        // Replace the larger TOP value with maxRows in original SQL
        // Find the TOP value position in the original SQL
        const afterSelectOriginal = sql.slice(selectPos + 6);
        const topValueRegex = /^(\s+(?:(?:DISTINCT|ALL)\s+)?TOP\s+)\d+/i;
        const origMatch = afterSelectOriginal.match(topValueRegex);
        if (origMatch) {
            const prefix = sql.slice(0, selectPos + 6);
            const topPrefix = origMatch[1];
            const rest = afterSelectOriginal.slice(origMatch[0].length);
            return prefix + topPrefix + maxRows + rest;
        }

        return sql;
    }

    // No existing TOP - inject one after SELECT (and after DISTINCT/ALL if present)
    const afterSelectOriginal = sql.slice(selectPos + 6);
    const distinctAllMatch = afterSelectOriginal.match(/^(\s+(?:DISTINCT|ALL)\s+)/i);

    if (distinctAllMatch) {
        // Insert TOP after DISTINCT/ALL
        const prefix = sql.slice(0, selectPos + 6) + distinctAllMatch[1];
        const rest = afterSelectOriginal.slice(distinctAllMatch[0].length);
        return prefix + `TOP ${maxRows} ` + rest;
    } else {
        // Insert TOP right after SELECT
        const prefix = sql.slice(0, selectPos + 6);
        const rest = afterSelectOriginal;
        return prefix + ` TOP ${maxRows}` + rest;
    }
}

/**
 * MySQL/OceanBase: Inject or adjust LIMIT clause
 */
function injectLimit(sql: string, stripped: string, maxRows: number): string {
    const normalizedStripped = stripped.toUpperCase();

    // Find existing LIMIT at the outermost level (depth 0)
    const limitInfo = findOuterLimit(normalizedStripped);

    if (limitInfo) {
        if (limitInfo.value <= maxRows) {
            // Existing LIMIT is already within bounds
            return sql;
        }

        // Replace the LIMIT value in original SQL
        // Find the corresponding position in the original SQL
        const originalUpper = sql.toUpperCase();
        const limitMatch = findLimitInOriginal(originalUpper, limitInfo.hasOffset);

        if (limitMatch) {
            if (limitMatch.offsetEnd !== undefined) {
                // LIMIT offset, count → replace count
                const prefix = sql.slice(0, limitMatch.valueStart);
                const rest = sql.slice(limitMatch.valueEnd);
                return prefix + maxRows + rest;
            } else {
                // LIMIT count → replace count
                const prefix = sql.slice(0, limitMatch.valueStart);
                const rest = sql.slice(limitMatch.valueEnd);
                return prefix + maxRows + rest;
            }
        }

        return sql;
    }

    // No existing LIMIT - append one
    // Handle trailing semicolons or whitespace
    const trimmed = sql.trimEnd();
    return trimmed + ` LIMIT ${maxRows}`;
}

/**
 * Find the position of the outermost SELECT keyword.
 * For WITH statements, finds the final (terminal) SELECT after CTE definitions.
 */
function findOuterSelectPosition(normalized: string): number {
    const firstWord = normalized.trim().split(/\s/)[0];

    if (firstWord === 'WITH') {
        // Walk through CTE definitions to find the terminal SELECT
        let pos = normalized.indexOf('WITH') + 4;
        const len = normalized.length;
        let depth = 0;

        while (pos < len) {
            if (normalized[pos] === '(') {
                depth++;
                pos++;
            } else if (normalized[pos] === ')') {
                depth--;
                pos++;
                if (depth === 0) {
                    // Skip whitespace and check for comma or SELECT
                    while (pos < len && /\s/.test(normalized[pos])) pos++;
                    if (pos >= len) return -1;
                    if (normalized[pos] === ',') {
                        pos++;
                        continue;
                    }
                    // Should be the terminal keyword - check if it's SELECT
                    if (normalized.slice(pos, pos + 6) === 'SELECT') {
                        return pos;
                    }
                    return -1;
                }
            } else {
                pos++;
            }
        }
        return -1;
    }

    // Simple SELECT statement
    const selectIdx = normalized.indexOf('SELECT');
    return selectIdx;
}

/**
 * Find the outermost LIMIT clause in normalized (uppercase, stripped) SQL.
 * Only considers LIMIT at parenthesis depth 0.
 */
function findOuterLimit(normalized: string): { value: number; hasOffset: boolean } | null {
    let depth = 0;
    let lastLimitPos = -1;

    for (let i = 0; i < normalized.length; i++) {
        if (normalized[i] === '(') {
            depth++;
        } else if (normalized[i] === ')') {
            depth--;
        } else if (depth === 0 && normalized[i] === 'L') {
            // Check for LIMIT keyword
            if (normalized.slice(i, i + 5) === 'LIMIT' &&
                (i === 0 || /\s/.test(normalized[i - 1])) &&
                (i + 5 >= normalized.length || /\s/.test(normalized[i + 5]))) {
                lastLimitPos = i;
            }
        }
    }

    if (lastLimitPos === -1) return null;

    // Parse the LIMIT value
    const afterLimit = normalized.slice(lastLimitPos + 5).trim();

    // Check for LIMIT offset, count or LIMIT count OFFSET offset
    const offsetCommaMatch = afterLimit.match(/^(\d+)\s*,\s*(\d+)/);
    if (offsetCommaMatch) {
        return { value: parseInt(offsetCommaMatch[2], 10), hasOffset: true };
    }

    const simpleMatch = afterLimit.match(/^(\d+)/);
    if (simpleMatch) {
        // Check for LIMIT N OFFSET M
        const afterValue = afterLimit.slice(simpleMatch[0].length).trim();
        return {
            value: parseInt(simpleMatch[1], 10),
            hasOffset: afterValue.startsWith('OFFSET'),
        };
    }

    return null;
}

interface LimitPosition {
    valueStart: number;
    valueEnd: number;
    offsetEnd?: number;
}

/**
 * Find the LIMIT clause position in the original SQL for replacement
 */
function findLimitInOriginal(sqlUpper: string, hasOffset: boolean): LimitPosition | null {
    // Find the last LIMIT at depth 0
    let depth = 0;
    let lastLimitPos = -1;

    for (let i = 0; i < sqlUpper.length; i++) {
        if (sqlUpper[i] === '(') {
            depth++;
        } else if (sqlUpper[i] === ')') {
            depth--;
        } else if (depth === 0 && sqlUpper[i] === 'L') {
            if (sqlUpper.slice(i, i + 5) === 'LIMIT' &&
                (i === 0 || /\s/.test(sqlUpper[i - 1])) &&
                (i + 5 >= sqlUpper.length || /\s/.test(sqlUpper[i + 5]))) {
                lastLimitPos = i;
            }
        }
    }

    if (lastLimitPos === -1) return null;

    const afterLimit = sqlUpper.slice(lastLimitPos + 5);
    const trimmedStart = afterLimit.length - afterLimit.trimStart().length;
    const valueStart = lastLimitPos + 5 + trimmedStart;

    if (hasOffset) {
        // LIMIT offset, count
        const commaMatch = afterLimit.trimStart().match(/^(\d+)\s*,\s*/);
        if (commaMatch) {
            const countStart = valueStart + commaMatch[0].length;
            const countMatch = sqlUpper.slice(countStart).match(/^\d+/);
            if (countMatch) {
                return {
                    valueStart: countStart,
                    valueEnd: countStart + countMatch[0].length,
                    offsetEnd: countStart + countMatch[0].length,
                };
            }
        }
        // LIMIT count OFFSET offset - just replace count
        const valueMatch = afterLimit.trimStart().match(/^(\d+)/);
        if (valueMatch) {
            return {
                valueStart,
                valueEnd: valueStart + valueMatch[0].length,
            };
        }
    } else {
        // LIMIT count
        const valueMatch = afterLimit.trimStart().match(/^(\d+)/);
        if (valueMatch) {
            return {
                valueStart,
                valueEnd: valueStart + valueMatch[0].length,
            };
        }
    }

    return null;
}
