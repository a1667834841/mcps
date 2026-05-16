/**
 * Base database provider interface
 * 
 * All database providers must implement this interface
 */

import {
  DatabaseInfo,
  TableInfo,
  TableSchema,
  IndexInfo,
  TableStats,
  QueryResult,
} from '../types/index.js';

/**
 * Database provider interface
 * 
 * Defines the contract for all database providers
 */
export abstract class DatabaseProvider {
  /**
   * Database type identifier
   */
  abstract readonly dbType: string;

  /**
   * Connect to the database
   */
  abstract connect(): Promise<void>;

  /**
   * List all databases (excluding system databases)
   */
  abstract listDatabases(): Promise<DatabaseInfo[]>;

  /**
   * List all tables in a specific database
   * @param database - Database name
   * @param schema - Schema name (defaults to 'dbo' for SQL Server, ignored for MySQL)
   */
  abstract listTables(database: string, schema?: string): Promise<TableInfo[]>;

  /**
   * Get table structure information
   * @param database - Database name
   * @param table - Table name
   * @param schema - Schema name
   */
  abstract describeTable(database: string, table: string, schema?: string): Promise<TableSchema>;

  /**
   * Execute a SQL query
   * @param query - SQL query string
   * @param database - Database name (optional, uses default if not provided)
   */
  abstract executeQuery(query: string, database?: string): Promise<QueryResult>;

  /**
   * Get index information for a table
   * @param database - Database name
   * @param table - Table name
   * @param schema - Schema name
   */
  abstract getTableIndexes(database: string, table: string, schema?: string): Promise<IndexInfo[]>;

  /**
   * Get table statistics
   * @param database - Database name
   * @param table - Table name
   * @param schema - Schema name
   */
  abstract getTableStats(database: string, table: string, schema?: string): Promise<TableStats>;

  /**
   * Close all connections
   */
  abstract close(): Promise<void>;
}
