/**
 * Unified types for database providers
 */

/**
 * Database information
 */
export interface DatabaseInfo {
  name: string;
  created_at?: string;
  [key: string]: unknown;
}

/**
 * Table information
 */
export interface TableInfo {
  name: string;
  schema: string;
  row_count?: number;
}

/**
 * Column information
 */
export interface ColumnInfo {
  name: string;
  position: number;
  data_type: string;
  max_length?: number;
  precision?: number;
  scale?: number;
  nullable: boolean;
  is_identity?: boolean;
  default_value?: string;
}

/**
 * Table schema with columns and primary keys
 */
export interface TableSchema {
  table: string;
  columns: ColumnInfo[];
  primary_keys: string[];
}

/**
 * Index information
 */
export interface IndexInfo {
  name: string;
  type: string;
  is_unique: boolean;
  is_primary_key: boolean;
  is_unique_constraint: boolean;
  columns: string;
}

/**
 * Table statistics
 */
export interface TableStats {
  table: string;
  row_count: number;
  total_rows_estimated?: number;
  size_mb?: number;
}

/**
 * Query result column
 */
export interface QueryResultColumn {
  name: string;
  value: unknown;
}

/**
 * Query result row
 */
export interface QueryResultRow {
  [columnName: string]: unknown;
}

/**
 * Query result with metadata
 */
export interface QueryResult {
  columns: string[];
  rows: QueryResultRow[];
  row_count: number;
  limited: boolean;
}

/**
 * Safety check result
 */
export interface SafetyCheckResult {
  safe: boolean;
  reason?: string;
}
