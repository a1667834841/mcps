import type { ServerConfig, ServerInfo, LogInfo, LogConfig } from '../types/index.js';

/**
 * 服务器信息提供者抽象基类
 * 定义获取服务器和日志信息的接口契约
 * 当前实现：ConfigFileProvider（YAML 配置文件）
 * 未来扩展：ApiProvider（从 API 获取）
 */
export abstract class ServerInfoProvider {
    /** 列出所有服务器信息 */
    abstract listServers(): ServerInfo[];

    /** 列出日志，支持按服务器 ID 和服务名过滤 */
    abstract listLogs(serverId?: string, service?: string): LogInfo[];

    /** 获取服务器完整配置（含认证信息） */
    abstract getServerConfig(serverId: string): ServerConfig | undefined;

    /** 获取指定服务器的指定日志配置 */
    abstract getLogConfig(serverId: string, logPath: string): { server: ServerConfig; log: LogConfig } | undefined;
}
