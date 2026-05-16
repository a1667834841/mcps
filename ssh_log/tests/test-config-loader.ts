import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../src/config/loader.js';

describe('loadConfig', () => {
    function createTempConfig(content: string): string {
        const dir = mkdtempSync(join(tmpdir(), 'ssh-log-test-'));
        const filePath = join(dir, 'config.yaml');
        writeFileSync(filePath, content, 'utf-8');
        return filePath;
    }

    it('应成功加载合法的 YAML 配置', () => {
        const yaml = `
servers:
  - id: server1
    name: "Test Server"
    host: "10.0.0.1"
    port: 22
    username: "user"
    password: "pass"
    logs:
      - name: "App Log"
        service: "my-service"
        path: "/var/log/app.log"
`;
        const filePath = createTempConfig(yaml);
        const config = loadConfig(filePath);
        assert.equal(config.servers.length, 1);
        assert.equal(config.servers[0].id, 'server1');
        assert.equal(config.servers[0].logs[0].name, 'App Log');
        rmSync(filePath, { recursive: true, force: true });
    });

    it('port 省略时应使用默认值 22', () => {
        const yaml = `
servers:
  - id: server1
    name: "Test Server"
    host: "10.0.0.1"
    username: "user"
    password: "pass"
    logs:
      - name: "App Log"
        service: "my-service"
        path: "/var/log/app.log"
`;
        const filePath = createTempConfig(yaml);
        const config = loadConfig(filePath);
        assert.equal(config.servers[0].port, 22);
        rmSync(filePath, { recursive: true, force: true });
    });

    it('应支持多个服务器和日志', () => {
        const yaml = `
servers:
  - id: s1
    name: "Server 1"
    host: "10.0.0.1"
    port: 22
    username: "user"
    password: "pass"
    logs:
      - name: "Log A"
        service: "svc-a"
        path: "/var/log/a.log"
      - name: "Log B"
        service: "svc-b"
        path: "/var/log/b.log"
  - id: s2
    name: "Server 2"
    host: "10.0.0.2"
    port: 2222
    username: "admin"
    password: "secret"
    logs:
      - name: "Log C"
        service: "svc-c"
        path: "/var/log/c.log"
`;
        const filePath = createTempConfig(yaml);
        const config = loadConfig(filePath);
        assert.equal(config.servers.length, 2);
        assert.equal(config.servers[0].logs.length, 2);
        assert.equal(config.servers[1].port, 2222);
        rmSync(filePath, { recursive: true, force: true });
    });

    it('文件不存在时应抛出错误', () => {
        assert.throws(() => loadConfig('/nonexistent/path/config.yaml'), /无法读取配置文件/);
    });

    it('无效 YAML 格式应抛出错误', () => {
        const filePath = createTempConfig('{ invalid yaml [[[');
        assert.throws(() => loadConfig(filePath), /YAML 解析失败/);
        rmSync(filePath, { recursive: true, force: true });
    });

    it('缺少必须字段应抛出验证错误', () => {
        const yaml = `
servers:
  - id: server1
    name: "Test"
    host: "10.0.0.1"
    username: "user"
    password: "pass"
    logs: []
`;
        const filePath = createTempConfig(yaml);
        assert.throws(() => loadConfig(filePath), /配置验证失败/);
        rmSync(filePath, { recursive: true, force: true });
    });

    it('日志路径非绝对路径应抛出验证错误', () => {
        const yaml = `
servers:
  - id: server1
    name: "Test"
    host: "10.0.0.1"
    port: 22
    username: "user"
    password: "pass"
    logs:
      - name: "Log"
        service: "svc"
        path: "relative/path.log"
`;
        const filePath = createTempConfig(yaml);
        assert.throws(() => loadConfig(filePath), /配置验证失败/);
        rmSync(filePath, { recursive: true, force: true });
    });
});
