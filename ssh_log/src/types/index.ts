/**
 * SSH Log MCP Server - Type Definitions
 */

/** 日志配置 */
export interface LogConfig {
  /** 日志显示名称 */
  name: string;
  /** 所属服务名称 */
  service: string;
  /** 日志目录绝对路径 */
  path: string;
}

/** 服务器配置 */
export interface ServerConfig {
    /** 服务器唯一标识 */
    id: string;
    /** 服务器显示名称 */
    name: string;
    /** 服务器主机地址 */
    host: string;
    /** SSH 端口 */
    port: number;
    /** SSH 用户名 */
    username: string;
    /** SSH 密码 */
    password: string;
    /** 日志列表 */
    logs: LogConfig[];
}

/** 应用配置（顶层） */
export interface AppConfig {
    servers: ServerConfig[];
}

/** 服务器信息（对外展示，不含敏感数据） */
export interface ServerInfo {
    id: string;
    name: string;
    host: string;
    services: string[];
}

/** 日志信息（对外展示） */
export interface LogInfo {
    serverId: string;
    serverName: string;
    name: string;
    service: string;
    path: string;
}

/** 日志文件信息 */
export interface LogFileInfo {
  fileName: string;
  size: string;
  modifiedTime: string;
}

/** 日志内容 */
export interface LogContent {
    serverId: string;
    logName: string;
    path: string;
    mode: 'head' | 'tail';
    lines: number;
    content: string;
}

/** 搜索结果 */
export interface SearchResult {
    serverId: string;
    logName: string;
    path: string;
    pattern: string;
    contextLines: number;
    matches: string;
    matchCount: number;
}
