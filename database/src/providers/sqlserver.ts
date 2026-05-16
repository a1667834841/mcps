/**
 * SQL Server Database Provider
 * 
 * Implements DatabaseProvider interface for Microsoft SQL Server
 */

import { Connection, ConnectionConfiguration, Request } from 'tedious';
import { DatabaseProvider } from './base.js';
import { SqlServerConfig, getSqlServerConfig } from '../config/sqlserver.js';
import { getSafetyConfig } from '../config/base.js';
import {
  DatabaseInfo,
  TableInfo,
  TableSchema,
  IndexInfo,
  TableStats,
  QueryResult,
} from '../types/index.js';

interface ConnectionCache {
  [key: string]: Connection;
}

export class SqlServerProvider extends DatabaseProvider {
  readonly dbType = 'sqlserver';

  private connections: ConnectionCache = {};
  private config: SqlServerConfig;

  constructor(config?: SqlServerConfig) {
    super();
    this.config = config || getSqlServerConfig();
  }

  private getConnectionConfiguration(database?: string): ConnectionConfiguration {
    const db = database || this.config.database;
    return {
      authentication: {
        type: 'default',
        options: {
          userName: this.config.user,
          password: this.config.password,
        },
      },
      server: this.config.host,
      options: {
        database: db,
        encrypt: this.config.encrypt,
        trustServerCertificate: this.config.trustServerCertificate,
        port: this.config.port,
        requestTimeout: this.config.requestTimeout || 30000,
        rowCollectionOnDone: false,
      },
    };
  }

  private createConnection(config: ConnectionConfiguration): Promise<Connection> {
    return new Promise((resolve, reject) => {
      const connection = new Connection(config);

      connection.on('connect', (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(connection);
        }
      });

      connection.on('error', (err) => {
        console.error('SQL Server connection error:', err);
      });

      connection.connect();
    });
  }

  private async getConnection(database?: string): Promise<Connection> {
    const cacheKey = database || this.config.database;

    if (!this.connections[cacheKey]) {
      const config = this.getConnectionConfiguration(database);
      this.connections[cacheKey] = await this.createConnection(config);
    }

    return this.connections[cacheKey];
  }

  /**
   * Connect to SQL Server
   */
  async connect(): Promise<void> {
    // Connection is lazy-loaded, just verify config is valid
    await this.getConnection();
  }

  /**
   * Execute a SQL query and return formatted results
   */
  async executeQuery(sql: string, database?: string): Promise<QueryResult> {
    const connection = await this.getConnection(database);

    const rows: any[][] = await new Promise((resolve, reject) => {
      const collectedRows: any[][] = [];
      const request = new Request(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(collectedRows);
        }
      });

      request.on('row', (columns: any[]) => {
        collectedRows.push(columns);
      });

      connection.execSql(request);
    });

    // Fallback safety net: slice rows in case SQL-level limit injection failed
    const { maxRows } = getSafetyConfig();
    const limitedRows = rows.slice(0, maxRows);

    // Extract column names and format rows
    const columns = limitedRows.length > 0
      ? limitedRows[0].map((col: any) => col.metadata.colName)
      : [];

    const formattedRows = limitedRows.map((row: any[]) => {
      const obj: Record<string, unknown> = {};
      row.forEach((col: any) => {
        obj[col.metadata.colName] = col.value;
      });
      return obj;
    });

    return {
      columns,
      rows: formattedRows,
      row_count: formattedRows.length,
      limited: rows.length > maxRows,
    };
  }

  /**
   * List all databases (excluding system databases)
   */
  async listDatabases(): Promise<DatabaseInfo[]> {
    const result = await this.executeQuery(`
      SELECT name, database_id, create_date
      FROM sys.databases
      WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')
      ORDER BY name
    `);

    return result.rows.map((row: any) => ({
      name: row.name as string,
      created_at: row.create_date ? new Date(row.create_date as string).toISOString() : undefined,
      database_id: row.database_id,
    }));
  }

  /**
   * List all tables in a database
   */
  async listTables(database: string, schema = 'dbo'): Promise<TableInfo[]> {
    const result = await this.executeQuery(`
      SELECT t.name AS table_name,
             s.name AS schema_name,
             SUM(p.rows) AS row_count
      FROM sys.tables t
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      LEFT JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0,1)
      WHERE s.name = '${schema.replace(/'/g, "''")}'
      GROUP BY t.name, s.name
      ORDER BY t.name
    `, database);

    return result.rows.map((row: any) => ({
      name: row.table_name as string,
      schema: row.schema_name as string,
      row_count: row.row_count || 0,
    }));
  }

  /**
   * Get table structure information
   */
  async describeTable(database: string, table: string, schema = 'dbo'): Promise<TableSchema> {
    // Get column information
    const columnResult = await this.executeQuery(`
      SELECT c.name AS column_name,
             c.column_id,
             ty.name AS data_type,
             c.max_length,
             c.precision,
             c.scale,
             c.is_nullable,
             c.is_identity,
             OBJECT_DEFINITION(c.default_object_id) AS default_value
      FROM sys.columns c
      INNER JOIN sys.types ty ON c.user_type_id = ty.user_type_id
      INNER JOIN sys.tables t ON c.object_id = t.object_id
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      WHERE t.name = '${table.replace(/'/g, "''")}' AND s.name = '${schema.replace(/'/g, "''")}'
      ORDER BY c.column_id
    `, database);

    const columns = columnResult.rows.map((row: any) => ({
      name: row.column_name as string,
      position: row.column_id as number,
      data_type: row.data_type as string,
      max_length: row.max_length as number,
      precision: row.precision as number,
      scale: row.scale as number,
      nullable: row.is_nullable === 1,
      is_identity: row.is_identity === 1,
      default_value: row.default_value as string,
    }));

    // Get primary key information
    const pkResult = await this.executeQuery(`
      SELECT c.name AS column_name
      FROM sys.key_constraints k
      INNER JOIN sys.index_columns ic ON k.unique_index_id = ic.index_id
      INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      INNER JOIN sys.tables t ON k.parent_object_id = t.object_id
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      WHERE t.name = '${table.replace(/'/g, "''")}' AND s.name = '${schema.replace(/'/g, "''")}' AND k.type = 'PK'
      ORDER BY ic.key_ordinal
    `, database);

    const primaryKeys = pkResult.rows.map((row: any) => row.column_name as string);

    return {
      table: `${schema}.${table}`,
      columns,
      primary_keys: primaryKeys,
    };
  }

  /**
   * Get index information for a table
   */
  async getTableIndexes(database: string, table: string, schema = 'dbo'): Promise<IndexInfo[]> {
    const result = await this.executeQuery(`
      SELECT i.name AS index_name,
             i.type_desc AS index_type,
             i.is_unique,
             i.is_primary_key,
             i.is_unique_constraint,
             STRING_AGG(c.name, ', ') AS columns
      FROM sys.indexes i
      INNER JOIN sys.tables t ON i.object_id = t.object_id
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
      INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      WHERE t.name = '${table.replace(/'/g, "''")}' AND s.name = '${schema.replace(/'/g, "''")}' AND i.is_primary_key = 0
      GROUP BY i.name, i.type_desc, i.is_unique, i.is_primary_key, i.is_unique_constraint
      ORDER BY i.name
    `, database);

    return result.rows.map((row: any) => ({
      name: row.index_name as string,
      type: row.index_type as string,
      is_unique: row.is_unique === 1,
      is_primary_key: row.is_primary_key === 1,
      is_unique_constraint: row.is_unique_constraint === 1,
      columns: row.columns as string,
    }));
  }

  /**
   * Get table statistics
   */
  async getTableStats(database: string, table: string, schema = 'dbo'): Promise<TableStats> {
    // Get accurate row count
    const countResult = await this.executeQuery(`
      SELECT COUNT(*) AS row_count
      FROM [${schema}].[${table}]
    `, database);

    const rowCount = countResult.rows[0]?.row_count as number || 0;

    // Get table size information
    const statsResult = await this.executeQuery(`
      SELECT
        SUM(p.rows) AS total_rows,
        SUM(a.total_pages) * 8 / 1024.0 AS total_size_mb
      FROM sys.tables t
      INNER JOIN sys.partitions p ON t.object_id = p.object_id
      INNER JOIN sys.allocation_units a ON p.partition_id = a.container_id
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      WHERE t.name = '${table.replace(/'/g, "''")}' AND s.name = '${schema.replace(/'/g, "''")}' AND p.index_id IN (0,1)
      GROUP BY t.name
    `, database);

    const statsData = statsResult.rows[0] || { total_rows: 0, total_size_mb: 0 };

    return {
      table: `${schema}.${table}`,
      row_count: rowCount,
      total_rows_estimated: statsData.total_rows as number || 0,
      size_mb: statsData.total_size_mb as number || 0,
    };
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    for (const key in this.connections) {
      try {
        this.connections[key].close();
      } catch (err) {
        // Ignore close errors
      }
    }
    this.connections = {};
  }
}
