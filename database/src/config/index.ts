/**
 * Configuration management
 */

export * from './base.js';
export * from './sqlserver.js';
export * from './mysql.js';
export * from './oceanbase.js';

import { DatabaseType, getDatabaseType } from './base.js';
import { SqlServerConfig, getSqlServerConfig } from './sqlserver.js';
import { MySqlConfig, getMySqlConfig } from './mysql.js';
import { OceanBaseConfig, getOceanBaseConfig } from './oceanbase.js';

/**
 * Union type for all database configs
 */
export type DatabaseConfig = SqlServerConfig | MySqlConfig | OceanBaseConfig;

/**
 * Get configuration based on DB_TYPE environment variable
 */
export function getConfig(): DatabaseConfig {
  const dbType = getDatabaseType();

  switch (dbType) {
    case DatabaseType.MYSQL:
      return getMySqlConfig();
    case DatabaseType.OCEANBASE:
      return getOceanBaseConfig();
    case DatabaseType.SQLSERVER:
    default:
      return getSqlServerConfig();
  }
}

/**
 * Get SQL Server config directly
 */
export function getSqlServerConfigDirect(): SqlServerConfig {
  return getSqlServerConfig();
}

/**
 * Get MySQL config directly
 */
export function getMySqlConfigDirect(): MySqlConfig {
  return getMySqlConfig();
}

/**
 * Get OceanBase config directly
 */
export function getOceanBaseConfigDirect(): OceanBaseConfig {
  return getOceanBaseConfig();
}
