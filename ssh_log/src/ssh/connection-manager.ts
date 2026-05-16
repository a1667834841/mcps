import { Client } from 'ssh2';
import type { ServerConfig } from '../types/index.js';

interface CachedConnection {
    client: Client;
    ready: boolean;
}

/**
 * SSH 连接管理器
 * 按服务器 ID 缓存连接，支持 lazy 初始化和自动重连
 */
export class SSHConnectionManager {
    private connections: Map<string, CachedConnection> = new Map();

    /**
     * 获取或创建 SSH 连接
     */
    async getConnection(serverConfig: ServerConfig): Promise<Client> {
        const cached = this.connections.get(serverConfig.id);
        if (cached && cached.ready) {
            return cached.client;
        }

        // 如果有旧连接但不可用，先清理
        if (cached) {
            try {
                cached.client.end();
            } catch {
                // ignore
            }
            this.connections.delete(serverConfig.id);
        }

        return this.createConnection(serverConfig);
    }

    /**
     * 创建新的 SSH 连接
     */
    private createConnection(serverConfig: ServerConfig): Promise<Client> {
        return new Promise((resolve, reject) => {
            const client = new Client();

            const timeout = setTimeout(() => {
                client.end();
                reject(new Error(`SSH 连接超时: ${serverConfig.host}:${serverConfig.port}`));
            }, 10000);

            client.on('ready', () => {
                clearTimeout(timeout);
                this.connections.set(serverConfig.id, { client, ready: true });
                resolve(client);
            });

            client.on('error', (err) => {
                clearTimeout(timeout);
                this.connections.delete(serverConfig.id);
                reject(new Error(`SSH 连接失败 (${serverConfig.host}:${serverConfig.port}): ${err.message}`));
            });

            client.on('close', () => {
                const cached = this.connections.get(serverConfig.id);
                if (cached) {
                    cached.ready = false;
                }
            });

            client.connect({
                host: serverConfig.host,
                port: serverConfig.port,
                username: serverConfig.username,
                password: serverConfig.password,
                keepaliveInterval: 10000,
                readyTimeout: 10000,
            });
        });
    }

    /**
     * 在指定服务器上执行命令
     */
    async executeCommand(serverConfig: ServerConfig, command: string, timeoutMs: number = 30000): Promise<string> {
        let client: Client;
        try {
            client = await this.getConnection(serverConfig);
        } catch (err) {
            throw err;
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`命令执行超时 (${timeoutMs}ms): ${command}`));
            }, timeoutMs);

            client.exec(command, (err, stream) => {
                if (err) {
                    clearTimeout(timeout);
                    // 连接可能已断开，清理缓存后重试一次
                    this.connections.delete(serverConfig.id);
                    reject(new Error(`命令执行失败: ${err.message}`));
                    return;
                }

                let stdout = '';
                let stderr = '';

                stream.on('data', (data: Buffer) => {
                    stdout += data.toString();
                });

                stream.stderr.on('data', (data: Buffer) => {
                    stderr += data.toString();
                });

                stream.on('close', (code: number) => {
                    clearTimeout(timeout);
                    // grep 返回 1 表示无匹配，不算错误
                    if (code === 0 || code === 1) {
                        resolve(stdout);
                    } else {
                        reject(new Error(`命令返回错误码 ${code}: ${stderr || stdout}`));
                    }
                });
            });
        });
    }

    /**
     * 关闭指定服务器的连接
     */
    closeConnection(serverId: string): void {
        const cached = this.connections.get(serverId);
        if (cached) {
            try {
                cached.client.end();
            } catch {
                // ignore
            }
            this.connections.delete(serverId);
        }
    }

    /**
     * 关闭所有连接
     */
    closeAll(): void {
        for (const [id, cached] of this.connections) {
            try {
                cached.client.end();
            } catch {
                // ignore
            }
        }
        this.connections.clear();
    }
}
