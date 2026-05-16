import type { AppConfig, ServerConfig, ServerInfo, LogInfo, LogConfig } from '../types/index.js';
import { ServerInfoProvider } from './base.js';

/**
 * 基于配置文件的服务器信息提供者
 * 从解析后的 YAML 配置中读取服务器和日志信息
 */
export class ConfigFileProvider extends ServerInfoProvider {
    private config: AppConfig;

    constructor(config: AppConfig) {
        super();
        this.config = config;
    }

    listServers(): ServerInfo[] {
        return this.config.servers.map((server) => ({
            id: server.id,
            name: server.name,
            host: server.host,
            services: [...new Set(server.logs.map((log) => log.service))],
        }));
    }

    listLogs(serverId?: string, service?: string): LogInfo[] {
        let servers = this.config.servers;

        if (serverId) {
            servers = servers.filter((s) => s.id === serverId);
        }

        const logs: LogInfo[] = [];
        for (const server of servers) {
            for (const log of server.logs) {
                if (service && log.service !== service) {
                    continue;
                }
                logs.push({
                    serverId: server.id,
                    serverName: server.name,
                    name: log.name,
                    service: log.service,
                    path: log.path,
                });
            }
        }

        return logs;
    }

    getServerConfig(serverId: string): ServerConfig | undefined {
        return this.config.servers.find((s) => s.id === serverId);
    }

    getLogConfig(serverId: string, logPath: string): { server: ServerConfig; log: LogConfig } | undefined {
        const server = this.config.servers.find((s) => s.id === serverId);
        if (!server) return undefined;

        const log = server.logs.find((l) => l.path === logPath);
        if (!log) return undefined;

        return { server, log };
    }
}
