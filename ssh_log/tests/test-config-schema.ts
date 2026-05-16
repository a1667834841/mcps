import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AppConfigSchema, ServerConfigSchema, LogConfigSchema } from '../src/config/schema.js';

describe('LogConfigSchema', () => {
    it('应验证合法的日志配置', () => {
        const valid = { name: 'App Log', service: 'user-service', path: '/var/log/app.log' };
        const result = LogConfigSchema.safeParse(valid);
        assert.equal(result.success, true);
    });

    it('应拒绝空名称', () => {
        const invalid = { name: '', service: 'user-service', path: '/var/log/app.log' };
        const result = LogConfigSchema.safeParse(invalid);
        assert.equal(result.success, false);
    });

    it('应拒绝空服务名', () => {
        const invalid = { name: 'App Log', service: '', path: '/var/log/app.log' };
        const result = LogConfigSchema.safeParse(invalid);
        assert.equal(result.success, false);
    });

    it('应拒绝非绝对路径', () => {
        const invalid = { name: 'App Log', service: 'user-service', path: 'relative/path.log' };
        const result = LogConfigSchema.safeParse(invalid);
        assert.equal(result.success, false);
    });

    it('应拒绝缺少 path 字段', () => {
        const invalid = { name: 'App Log', service: 'user-service' };
        const result = LogConfigSchema.safeParse(invalid);
        assert.equal(result.success, false);
    });
});

describe('ServerConfigSchema', () => {
    const validLog = { name: 'App Log', service: 'svc', path: '/var/log/app.log' };

    it('应验证合法的服务器配置', () => {
        const valid = {
            id: 'server1',
            name: 'Server 1',
            host: '192.168.1.1',
            port: 22,
            username: 'admin',
            password: 'pass123',
            logs: [validLog],
        };
        const result = ServerConfigSchema.safeParse(valid);
        assert.equal(result.success, true);
    });

    it('port 默认值应为 22', () => {
        const withoutPort = {
            id: 'server1',
            name: 'Server 1',
            host: '192.168.1.1',
            username: 'admin',
            password: 'pass123',
            logs: [validLog],
        };
        const result = ServerConfigSchema.safeParse(withoutPort);
        assert.equal(result.success, true);
        if (result.success) {
            assert.equal(result.data.port, 22);
        }
    });

    it('应拒绝空 id', () => {
        const invalid = {
            id: '',
            name: 'Server 1',
            host: '192.168.1.1',
            port: 22,
            username: 'admin',
            password: 'pass123',
            logs: [validLog],
        };
        const result = ServerConfigSchema.safeParse(invalid);
        assert.equal(result.success, false);
    });

    it('应拒绝无效端口号', () => {
        const invalid = {
            id: 'server1',
            name: 'Server 1',
            host: '192.168.1.1',
            port: 99999,
            username: 'admin',
            password: 'pass123',
            logs: [validLog],
        };
        const result = ServerConfigSchema.safeParse(invalid);
        assert.equal(result.success, false);
    });

    it('应拒绝空日志数组', () => {
        const invalid = {
            id: 'server1',
            name: 'Server 1',
            host: '192.168.1.1',
            port: 22,
            username: 'admin',
            password: 'pass123',
            logs: [],
        };
        const result = ServerConfigSchema.safeParse(invalid);
        assert.equal(result.success, false);
    });

    it('应拒绝空密码', () => {
        const invalid = {
            id: 'server1',
            name: 'Server 1',
            host: '192.168.1.1',
            port: 22,
            username: 'admin',
            password: '',
            logs: [validLog],
        };
        const result = ServerConfigSchema.safeParse(invalid);
        assert.equal(result.success, false);
    });
});

describe('AppConfigSchema', () => {
    const validServer = {
        id: 'server1',
        name: 'Server 1',
        host: '192.168.1.1',
        port: 22,
        username: 'admin',
        password: 'pass123',
        logs: [{ name: 'App Log', service: 'svc', path: '/var/log/app.log' }],
    };

    it('应验证合法的应用配置', () => {
        const valid = { servers: [validServer] };
        const result = AppConfigSchema.safeParse(valid);
        assert.equal(result.success, true);
    });

    it('应支持多个服务器', () => {
        const valid = {
            servers: [
                validServer,
                { ...validServer, id: 'server2', name: 'Server 2', host: '192.168.1.2' },
            ],
        };
        const result = AppConfigSchema.safeParse(valid);
        assert.equal(result.success, true);
        if (result.success) {
            assert.equal(result.data.servers.length, 2);
        }
    });

    it('应拒绝空服务器数组', () => {
        const invalid = { servers: [] };
        const result = AppConfigSchema.safeParse(invalid);
        assert.equal(result.success, false);
    });

    it('应拒绝缺少 servers 字段', () => {
        const invalid = {};
        const result = AppConfigSchema.safeParse(invalid);
        assert.equal(result.success, false);
    });
});
