/**
 * OceanBase configuration
 */

import { BaseDatabaseConfig, getCommonConfig } from './base.js';

export interface OceanBaseConfig extends BaseDatabaseConfig {
  charset?: string;
}

/**
 * Get OceanBase configuration
 * Priority: OCEANBASE_* env vars > DB_* env vars > defaults
 */
export function getOceanBaseConfig(): OceanBaseConfig {
  const commonConfig = getCommonConfig();

  return {
    host: process.env.OCEANBASE_HOST || commonConfig.host,
    port: parseInt(process.env.OCEANBASE_PORT || String(commonConfig.port), 10),
    user: process.env.OCEANBASE_USER || commonConfig.user,
    password: process.env.OCEANBASE_PASSWORD || commonConfig.password,
    database: process.env.OCEANBASE_DATABASE || commonConfig.database,
    charset: process.env.OCEANBASE_CHARSET || process.env.DB_CHARSET || 'utf8mb4',
    requestTimeout: commonConfig.requestTimeout,
  };
}
