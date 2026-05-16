import type { AppConfig } from '../types/index.js';
import { ServerInfoProvider } from './base.js';
import { ConfigFileProvider } from './config-file.js';

/**
 * 创建服务器信息提供者
 * 当前仅支持配置文件方式，未来可根据环境变量切换到 API 方式
 */
export function createProvider(config: AppConfig): ServerInfoProvider {
    return new ConfigFileProvider(config);
}
