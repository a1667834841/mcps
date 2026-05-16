import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { AppConfigSchema } from './schema.js';
import type { AppConfig } from '../types/index.js';

/**
 * 获取配置文件路径
 * 优先级：环境变量 SSH_LOG_CONFIG > 当前目录 ./config.yaml
 */
function getConfigPath(): string {
    if (process.env.SSH_LOG_CONFIG) {
        return resolve(process.env.SSH_LOG_CONFIG);
    }
    return resolve(process.cwd(), 'config.yaml');
}

/**
 * 加载并验证 YAML 配置文件
 */
export function loadConfig(configPath?: string): AppConfig {
    const filePath = configPath ?? getConfigPath();

    let fileContent: string;
    try {
        fileContent = readFileSync(filePath, 'utf-8');
    } catch (err) {
        throw new Error(`无法读取配置文件: ${filePath}\n${(err as Error).message}`);
    }

    let rawConfig: unknown;
    try {
        rawConfig = parseYaml(fileContent);
    } catch (err) {
        throw new Error(`YAML 解析失败: ${filePath}\n${(err as Error).message}`);
    }

    const result = AppConfigSchema.safeParse(rawConfig);
    if (!result.success) {
        const issues = result.error.issues
            .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
            .join('\n');
        throw new Error(`配置验证失败:\n${issues}`);
    }

    return result.data as AppConfig;
}
