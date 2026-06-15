/**
 * Base database configuration interface
 */

/**
 * Base configuration for all database providers
 */
export interface BaseDatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  requestTimeout?: number;
}

/**
 * Extended configuration with database-specific options
 */
export interface ExtendedDatabaseConfig extends BaseDatabaseConfig {
  encrypt?: boolean;
  trustServerCertificate?: boolean;
  charset?: string;
}

/**
 * Database type enum
 */
export enum DatabaseType {
  SQLSERVER = 'sqlserver',
  MYSQL = 'mysql',
  OCEANBASE = 'oceanbase',
}

/**
 * Get default port for database type
 */
export function getDefaultPort(dbType: DatabaseType): number {
  switch (dbType) {
    case DatabaseType.MYSQL:
      return 3306;
    case DatabaseType.OCEANBASE:
      return 2881;
    case DatabaseType.SQLSERVER:
    default:
      return 1433;
  }
}

/**
 * Get database type from environment variable
 */
export function getDatabaseType(): DatabaseType {
  const dbType = process.env.DB_TYPE?.toLowerCase();

  if (dbType === 'oceanbase') {
    return DatabaseType.OCEANBASE;
  }

  if (dbType === 'mysql') {
    return DatabaseType.MYSQL;
  }

  // Default to SQL Server
  return DatabaseType.SQLSERVER;
}

/**
 * Safety configuration interface
 */
export interface SafetyConfig {
  readonly: boolean;
  maxRows: number;
}

/**
 * Get safety configuration from environment variables
 */
export function getSafetyConfig(): SafetyConfig {
  return {
    readonly: process.env.DB_READONLY !== 'false', // default true
    maxRows: parseInt(process.env.DB_MAX_ROWS || '1000', 10) || 1000,
  };
}

/**
 * Get common database configuration from DB_* environment variables
 * Priority: Specific DB env vars > Common DB_* env vars > Defaults
 */
export function getCommonConfig(): BaseDatabaseConfig {
  const dbType = getDatabaseType();
  const defaultPort = getDefaultPort(dbType);

  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || String(defaultPort), 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'master',
    requestTimeout: parseInt(process.env.DB_REQUEST_TIMEOUT || '30000', 10),
  };
}

/**
 * Built-in common sensitive column names (case-insensitive match).
 * Covers credentials, personal privacy, and financial data naming variants.
 */
export const BUILTIN_SENSITIVE_COLUMNS: string[] = [
  // 凭证
  'password', 'passwd', 'pwd', 'secret', 'token', 'api_key', 'apikey',
  'private_key', 'credential',
  // 个人隐私
  'id_card', 'idcard', 'ssn', 'mobile', 'phone', 'telephone', 'email', 'mail',
  // 金融
  'bank_card', 'bankcard', 'card_no', 'cardno', 'credit_card',
];

/**
 * Sensitive column redaction configuration
 */
export interface SensitiveConfig {
  enabled: boolean;
  columns: string[];      // 合并后完整名单（原样大小写，用于日志/展示）
  matchSet: Set<string>;  // 小写化集合，供脱敏函数 O(1) 查询
}

/**
 * Get sensitive column config from environment + builtin list.
 * Effective list = BUILTIN_SENSITIVE_COLUMNS ∪ DB_SENSITIVE_COLUMNS
 */
export function getSensitiveConfig(): SensitiveConfig {
  const userCols = (process.env.DB_SENSITIVE_COLUMNS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const merged = [...BUILTIN_SENSITIVE_COLUMNS, ...userCols];
  const matchSet = new Set(merged.map(c => c.toLowerCase()));

  return {
    enabled: matchSet.size > 0,
    columns: merged,
    matchSet,
  };
}
