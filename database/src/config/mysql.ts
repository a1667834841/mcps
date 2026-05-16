/**
 * MySQL configuration
 */

import { BaseDatabaseConfig, getCommonConfig } from './base.js';

export interface MySqlConfig extends BaseDatabaseConfig {
  charset?: string;
}

/**
 * Get MySQL configuration
 * Priority: MYSQL_* env vars > DB_* env vars > defaults
 */
export function getMySqlConfig(): MySqlConfig {
  const commonConfig = getCommonConfig();

  return {
    host: process.env.MYSQL_HOST || commonConfig.host,
    port: parseInt(process.env.MYSQL_PORT || String(commonConfig.port), 10),
    user: process.env.MYSQL_USER || commonConfig.user,
    password: process.env.MYSQL_PASSWORD || commonConfig.password,
    database: process.env.MYSQL_DATABASE || commonConfig.database,
    charset: process.env.MYSQL_CHARSET || process.env.DB_CHARSET || 'utf8mb4',
    requestTimeout: commonConfig.requestTimeout,
  };
}
