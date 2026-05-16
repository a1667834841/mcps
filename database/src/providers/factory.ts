/**
 * Database Provider Factory
 *
 * Creates and returns the appropriate database provider based on configuration
 */

import { DatabaseProvider } from './base.js';
import { SqlServerProvider } from './sqlserver.js';
import { MySqlProvider } from './mysql.js';
import { OceanBaseProvider } from './oceanbase.js';
import { DatabaseType, getDatabaseType } from '../config/base.js';
import { getSqlServerConfig } from '../config/sqlserver.js';
import { getMySqlConfig } from '../config/mysql.js';
import { getOceanBaseConfig } from '../config/oceanbase.js';

/**
 * Create a database provider instance based on DB_TYPE environment variable
 */
export function createProvider(): DatabaseProvider {
  const dbType = getDatabaseType();

  switch (dbType) {
    case DatabaseType.MYSQL:
      const mysqlConfig = getMySqlConfig();
      return new MySqlProvider(mysqlConfig);
    
    case DatabaseType.OCEANBASE:
      const oceanBaseConfig = getOceanBaseConfig();
      return new OceanBaseProvider(oceanBaseConfig);

    case DatabaseType.SQLSERVER:
    default:
      const sqlServerConfig = getSqlServerConfig();
      return new SqlServerProvider(sqlServerConfig);
  }
}

/**
 * Create a SQL Server provider instance
 */
export function createSqlServerProvider(): SqlServerProvider {
  const config = getSqlServerConfig();
  return new SqlServerProvider(config);
}

/**
 * Create a MySQL provider instance
 */
export function createMySqlProvider(): MySqlProvider {
  const config = getMySqlConfig();
  return new MySqlProvider(config);
}

/**
 * Create an OceanBase provider instance
 */
export function createOceanBaseProvider(): OceanBaseProvider {
  const config = getOceanBaseConfig();
  return new OceanBaseProvider(config);
}
