import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigFileProvider } from '../src/providers/config-file.js';
import type { AppConfig } from '../src/types/index.js';

const mockConfig: AppConfig = {
    servers: [
        {
            id: 'server1',
            name: '生产服务器 1',
            host: '192.168.1.100',
            port: 22,
            username: 'admin',
            password: 'pass1',
            logs: [
                { name: '应用日志', service: 'user-service', path: '/var/log/user-service/app.log' },
                { name: '错误日志', service: 'user-service', path: '/var/log/user-service/error.log' },
                { name: '网关日志', service: 'nginx', path: '/var/log/nginx/access.log' },
            ],
        },
        {
            id: 'server2',
            name: '生产服务器 2',
            host: '192.168.1.101',
            port: 2222,
            username: 'deploy',
            password: 'pass2',
            logs: [
                { name: '订单日志', service: 'order-service', path: '/var/log/order-service/app.log' },
                { name: '支付日志', service: 'payment-service', path: '/var/log/payment/app.log' },
            ],
        },
    ],
};

describe('ConfigFileProvider.listServers', () => {
    const provider = new ConfigFileProvider(mockConfig);

    it('应返回所有服务器信息', () => {
        const servers = provider.listServers();
        assert.equal(servers.length, 2);
    });

    it('应返回正确的服务器字段', () => {
        const servers = provider.listServers();
        const s1 = servers[0];
        assert.equal(s1.id, 'server1');
        assert.equal(s1.name, '生产服务器 1');
        assert.equal(s1.host, '192.168.1.100');
    });

    it('应返回去重后的服务列表', () => {
        const servers = provider.listServers();
        const s1 = servers[0];
        // server1 有 user-service（出现2次）和 nginx，去重后应为 2 个
        assert.equal(s1.services.length, 2);
        assert.ok(s1.services.includes('user-service'));
        assert.ok(s1.services.includes('nginx'));
    });

    it('不应包含敏感信息', () => {
        const servers = provider.listServers();
        const s1 = servers[0] as Record<string, unknown>;
        assert.equal('password' in s1, false);
        assert.equal('username' in s1, false);
    });
});

describe('ConfigFileProvider.listLogs', () => {
    const provider = new ConfigFileProvider(mockConfig);

    it('无过滤条件时应返回所有日志', () => {
        const logs = provider.listLogs();
        assert.equal(logs.length, 5);
    });

    it('应按 server_id 过滤', () => {
        const logs = provider.listLogs('server1');
        assert.equal(logs.length, 3);
        assert.ok(logs.every((l) => l.serverId === 'server1'));
    });

    it('应按 service 过滤', () => {
        const logs = provider.listLogs(undefined, 'user-service');
        assert.equal(logs.length, 2);
        assert.ok(logs.every((l) => l.service === 'user-service'));
    });

    it('应同时按 server_id 和 service 过滤', () => {
        const logs = provider.listLogs('server1', 'nginx');
        assert.equal(logs.length, 1);
        assert.equal(logs[0].name, '网关日志');
        assert.equal(logs[0].path, '/var/log/nginx/access.log');
    });

    it('不存在的 server_id 应返回空数组', () => {
        const logs = provider.listLogs('nonexistent');
        assert.equal(logs.length, 0);
    });

    it('不存在的 service 应返回空数组', () => {
        const logs = provider.listLogs(undefined, 'nonexistent');
        assert.equal(logs.length, 0);
    });

    it('日志信息应包含 serverName', () => {
        const logs = provider.listLogs('server2');
        assert.ok(logs.every((l) => l.serverName === '生产服务器 2'));
    });
});

describe('ConfigFileProvider.getServerConfig', () => {
    const provider = new ConfigFileProvider(mockConfig);

    it('应返回存在的服务器配置', () => {
        const config = provider.getServerConfig('server1');
        assert.notEqual(config, undefined);
        assert.equal(config!.id, 'server1');
        assert.equal(config!.host, '192.168.1.100');
        assert.equal(config!.port, 22);
        assert.equal(config!.username, 'admin');
    });

    it('不存在的 ID 应返回 undefined', () => {
        const config = provider.getServerConfig('nonexistent');
        assert.equal(config, undefined);
    });
});

describe('ConfigFileProvider.getLogConfig', () => {
    const provider = new ConfigFileProvider(mockConfig);

    it('应返回匹配的服务器和日志配置', () => {
        const result = provider.getLogConfig('server1', '/var/log/user-service/app.log');
        assert.notEqual(result, undefined);
        assert.equal(result!.server.id, 'server1');
        assert.equal(result!.log.name, '应用日志');
        assert.equal(result!.log.service, 'user-service');
    });

    it('不存在的服务器 ID 应返回 undefined', () => {
        const result = provider.getLogConfig('nonexistent', '/var/log/user-service/app.log');
        assert.equal(result, undefined);
    });

    it('不存在的日志路径应返回 undefined', () => {
        const result = provider.getLogConfig('server1', '/var/log/nonexistent.log');
        assert.equal(result, undefined);
    });

    it('日志路径属于其他服务器时应返回 undefined', () => {
        const result = provider.getLogConfig('server1', '/var/log/order-service/app.log');
        assert.equal(result, undefined);
    });
});
