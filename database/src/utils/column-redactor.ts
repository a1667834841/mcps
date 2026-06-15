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