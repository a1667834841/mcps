/**
 * OceanBase Database Provider
 * 
 * Implements DatabaseProvider interface for OceanBase (MySQL compatible)
 * Uses same mysql2 driver as MySQL but with OceanBase-specific SQL adaptations
 */

import mysql, { Pool, RowDataPacket, FieldPacket } from 'mysql2/promise';
import { DatabaseProvider } from './base.js';
import { getOceanBaseConfig, OceanBaseConfig } from '../config/oceanbase.js';
import { getSafetyConfig } from '../config/base.js';
import {
  DatabaseInfo,
  TableInfo,
  TableSchema,
  IndexInfo,
  TableStats,
  QueryResult,
  ColumnInfo,
} from '../types/index.js';

export class OceanBaseProvider extends DatabaseProvider {
  readonly dbType = 'oceanbase';

  private pool: Pool | null = null;
  private obConfig: OceanBaseConfig;

  constructor(config?: OceanBaseConfig) {
    super();
    this.obConfig = config || getOceanBaseConfig();
  }

  private createPoolConfig(database?: string): mysql.PoolOptions {
    const db = database || this.obConfig.database;
    return {
      host: this.obConfig.host,
      port: this.obConfig.port,
      user: this.obConfig.user,
      password: this.obConfig.password,
      database: db,
      charset: this.obConfig.charset,
      connectionLimit: 10,
    };
  }

  private async getPool(database?: string): Promise<Pool> {
    if (!this.pool) {
      const config = this.createPoolConfig(database);
      this.pool = mysql.createPool(config);
    }
    return this.pool;
  }

  /**
   * Connect to OceanBase
   */
  async connect(): Promise<void> {
    const pool = await this.getPool();
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
  }

  /**
   * Execute a SQL query and return formatted results
   */
  async executeQuery(query: string, database?: string): Promise<QueryResult> {
    const pool = await this.getPool(database);

    try {
      const [rows, fields] = await pool.execute(query);

      const typedRows = rows as RowDataPacket[];
      const typedFields = fields as FieldPacket[];

      const columns = typedFields.map((field) => field.name);

      const formattedRows = typedRows.map((row) => {
        const obj: Record<string, unknown> = {};
        for (const col of columns) {
          obj[col] = row[col];
        }
        return obj;
      });

      // Fallback safety net: slice rows in case SQL-level limit injection failed
      const { maxRows } = getSafetyConfig();
      const limitedRows = formattedRows.slice(0, maxRows);

      return {
        columns,
        rows: limitedRows,
        row_count: limitedRows.length,
        limited: formattedRows.length > maxRows,
      };
    } catch (error: any) {
      throw new Error(`OceanBase Error: ${error.message}`);
    }
  }

  /**
   * List all databases (excluding system databases)
   */
  async listDatabases(): Promise<DatabaseInfo[]> {
    const result = await this.executeQuery(`
      SELECT schema_name AS name,
             DEFAULT_CHARACTER_SET_NAME AS charset,
             DEFAULT_COLLATION_NAME AS collation
      FROM information_schema.SCHEMATA
      WHERE schema_name NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys', 'oceanbase')
      ORDER BY schema_name
    `);

    return result.rows.map((row: any) => ({
      name: row.name as string,
      charset: row.charset as string,
      collation: row.collation as string,
    }));
  }

  /**
   * List all tables in a database
   */
  async listTables(database: string, schema = 'dbo'): Promise<TableInfo[]> {
    const result = await this.executeQuery(`
      SELECT t.table_name AS table_name,
             t.table_schema AS schema_name,
             t.table_rows AS row_count
      FROM information_schema.tables t
      WHERE t.table_schema = '${database.replace(/'/g, "''")}'
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name
    `, database);

    return result.rows.map((row: any) => ({
      name: row.table_name as string,
      schema: row.schema_name as string,
      row_count: row.row_count || 0,
    }));
  }

  /**
   * Get table structure information
   * Uses column aliases to avoid reserved word conflicts in OceanBase
   */
  async describeTable(database: string, table: string, schema = 'dbo'): Promise<TableSchema> {
    const columnResult = await this.executeQuery(`
      SELECT c.column_name AS col_name,
             c.ordinal_position AS col_position,
             c.data_type AS col_data_type,
             c.character_maximum_length AS col_max_length,
             c.numeric_precision AS col_precision,
             c.numeric_scale AS col_scale,
             CASE WHEN c.is_nullable = 'YES' THEN 1 ELSE 0 END AS col_is_nullable,
             CASE WHEN c.extra = 'auto_increment' THEN 1 ELSE 0 END AS col_is_identity,
             c.column_default AS col_default_value
      FROM information_schema.columns c
      WHERE c.table_schema = '${database.replace(/'/g, "''")}'
        AND c.table_name = '${table.replace(/'/g, "''")}'
      ORDER BY c.ordinal_position
    `, database);

    const columns: ColumnInfo[] = columnResult.rows.map((row: any) => ({
      name: row.col_name as string,
      position: row.col_position as number,
      data_type: row.col_data_type as string,
      max_length: row.col_max_length as number | undefined,
      precision: row.col_precision as number | undefined,
      scale: row.col_scale as number | undefined,
      nullable: row.col_is_nullable === 1,
      is_identity: row.col_is_identity === 1,
      default_value: row.col_default_value as string | undefined,
    }));

    // Use DISTINCT to handle OceanBase returning duplicate primary key rows
    const pkResult = await this.executeQuery(`
      SELECT DISTINCT k.column_name AS pk_column
      FROM information_schema.key_column_usage k
      INNER JOIN information_schema.table_constraints t 
        ON k.constraint_name = t.constraint_name 
        AND k.table_schema = t.table_schema
      WHERE k.table_schema = '${database.replace(/'/g, "''")}'
        AND k.table_name = '${table.replace(/'/g, "''")}'
        AND t.constraint_type = 'PRIMARY KEY'
      ORDER BY k.ordinal_position
    `, database);

    const primaryKeys = pkResult.rows.map((row: any) => row.pk_column as string);

    return {
      table: table,
      columns,
      primary_keys: primaryKeys,
    };
  }

  /**
   * Get index information for a table
   */
  async getTableIndexes(database: string, table: string, schema = 'dbo'): Promise<IndexInfo[]> {
    const result = await this.executeQuery(`
      SELECT DISTINCT
        i.index_name AS idx_name,
        CASE
          WHEN i.index_type = 'FULLTEXT' THEN 'FULLTEXT'
          WHEN i.index_type = 'SPATIAL' THEN 'SPATIAL'
          ELSE 'BTREE'
        END AS idx_type,
        CASE WHEN i.non_unique = 0 THEN 1 ELSE 0 END AS idx_is_unique,
        CASE WHEN i.index_name = 'PRIMARY' THEN 1 ELSE 0 END AS idx_is_primary_key,
        0 AS idx_is_unique_constraint,
        GROUP_CONCAT(i.column_name ORDER BY i.seq_in_index) AS idx_columns
      FROM information_schema.statistics i
      WHERE i.table_schema = '${database.replace(/'/g, "''")}'
        AND i.table_name = '${table.replace(/'/g, "''")}'
      GROUP BY i.index_name, i.non_unique, i.index_type
      HAVING i.index_name != 'PRIMARY'
      ORDER BY i.index_name
    `, database);

    return result.rows.map((row: any) => ({
      name: row.idx_name as string,
      type: row.idx_type as string,
      is_unique: row.idx_is_unique === 1,
      is_primary_key: row.idx_is_primary_key === 1,
      is_unique_constraint: row.idx_is_unique_constraint === 1,
      columns: row.idx_columns as string,
    }));
  }

  /**
   * Get table statistics
   */
  async getTableStats(database: string, table: string, schema = 'dbo'): Promise<TableStats> {
    const result = await this.executeQuery(`
      SELECT
        t.table_name AS tbl_name,
        t.table_rows AS tbl_row_count,
        ROUND((t.data_length + t.index_length) / 1024 / 1024, 2) AS tbl_size_mb
      FROM information_schema.tables t
      WHERE t.table_schema = '${database.replace(/'/g, "''")}'
        AND t.table_name = '${table.replace(/'/g, "''")}'
    `, database);

    const statsData = result.rows[0] || { tbl_row_count: 0, tbl_size_mb: 0 };

    const countResult = await this.executeQuery(`
      SELECT COUNT(*) AS cnt
      FROM \`${table}\`
    `, database);

    const accurateCount = countResult.rows[0]?.cnt as number || 0;

    return {
      table: table,
      row_count: accurateCount,
      total_rows_estimated: statsData.tbl_row_count as number || 0,
      size_mb: statsData.tbl_size_mb as number || 0,
    };
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}
