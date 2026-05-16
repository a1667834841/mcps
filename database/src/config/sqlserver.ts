/**
 * SQL Server configuration
 */

import { BaseDatabaseConfig, getCommonConfig } from './base.js';

export interface SqlServerConfig extends BaseDatabaseConfig {
  encrypt: boolean;
  trustServerCertificate: boolean;
}

/**
 * Get SQL Server configuration
 * Priority: SQLSERVER_* env vars > DB_* env vars > defaults
 */
export function getSqlServerConfig(): SqlServerConfig {
  const commonConfig = getCommonConfig();

  return {
    host: process.env.SQLSERVER_HOST || commonConfig.host,
    port: parseInt(process.env.SQLSERVER_PORT || String(commonConfig.port), 10),
    user: process.env.SQLSERVER_USER || commonConfig.user,
    password: process.env.SQLSERVER_PASSWORD || commonConfig.password,
    database: process.env.SQLSERVER_DATABASE || commonConfig.database,
    encrypt: process.env.SQLSERVER_ENCRYPT !== undefined
      ? process.env.SQLSERVER_ENCRYPT !== 'false'
      : process.env.DB_ENCRYPT !== 'false',
    trustServerCertificate: process.env.SQLSERVER_TRUST_SERVER_CERTIFICATE !== undefined
      ? process.env.SQLSERVER_TRUST_SERVER_CERTIFICATE !== 'false'
      : process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
    requestTimeout: commonConfig.requestTimeout,
  };
}
