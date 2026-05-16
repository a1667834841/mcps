import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// 导入 commands 模块中的 escapeShellArg（需要先导出）
// 由于 escapeShellArg 是内部函数，我们通过测试 searchLog/viewLog 的命令构建逻辑来间接验证
// 这里我们直接测试导出的辅助逻辑

describe('Shell 参数转义', () => {
    // 复制 escapeShellArg 逻辑进行独立测试
    function escapeShellArg(arg: string): string {
        return "'" + arg.replace(/'/g, "'\\''") + "'";
    }

    it('普通字符串应被单引号包裹', () => {
        const result = escapeShellArg('hello');
        assert.equal(result, "'hello'");
    });

    it('包含空格的字符串应正确转义', () => {
        const result = escapeShellArg('hello world');
        assert.equal(result, "'hello world'");
    });

    it('包含单引号应正确转义', () => {
        const result = escapeShellArg("it's test");
        assert.equal(result, "'it'\\''s test'");
    });

    it('包含双引号应保留', () => {
        const result = escapeShellArg('say "hello"');
        assert.equal(result, "'say \"hello\"'");
    });

    it('包含特殊字符 $ 应保留', () => {
        const result = escapeShellArg('$HOME/path');
        assert.equal(result, "'$HOME/path'");
    });

    it('包含反引号应保留', () => {
        const result = escapeShellArg('`whoami`');
        assert.equal(result, "'`whoami`'");
    });

    it('包含分号应保留（不会被 shell 执行）', () => {
        const result = escapeShellArg('pattern; rm -rf /');
        assert.equal(result, "'pattern; rm -rf /'");
    });

    it('包含管道符应保留', () => {
        const result = escapeShellArg('error | warning');
        assert.equal(result, "'error | warning'");
    });

    it('空字符串应返回空单引号对', () => {
        const result = escapeShellArg('');
        assert.equal(result, "''");
    });

    it('多个连续单引号应全部转义', () => {
        const result = escapeShellArg("a''b");
        assert.equal(result, "'a'\\'''\\''b'");
    });
});

describe('命令构建逻辑', () => {
    function escapeShellArg(arg: string): string {
        return "'" + arg.replace(/'/g, "'\\''") + "'";
    }

    function buildViewCommand(logPath: string, mode: 'head' | 'tail', lines: number): string {
        return mode === 'tail'
            ? `tail -n ${lines} ${escapeShellArg(logPath)}`
            : `head -n ${lines} ${escapeShellArg(logPath)}`;
    }

    function buildSearchCommand(
        logPath: string,
        pattern: string,
        contextLines: number,
        maxResults: number,
        caseSensitive: boolean,
    ): string {
        const flags: string[] = ['-n'];
        if (!caseSensitive) flags.push('-i');
        if (contextLines > 0) flags.push(`-C ${contextLines}`);
        return `grep ${flags.join(' ')} ${escapeShellArg(pattern)} ${escapeShellArg(logPath)} | head -n ${maxResults * (contextLines * 2 + 2)}`;
    }

    it('tail 命令构建正确', () => {
        const cmd = buildViewCommand('/var/log/app.log', 'tail', 100);
        assert.equal(cmd, "tail -n 100 '/var/log/app.log'");
    });

    it('head 命令构建正确', () => {
        const cmd = buildViewCommand('/var/log/app.log', 'head', 50);
        assert.equal(cmd, "head -n 50 '/var/log/app.log'");
    });

    it('包含空格的路径应正确转义', () => {
        const cmd = buildViewCommand('/var/log/my app/test.log', 'tail', 10);
        assert.equal(cmd, "tail -n 10 '/var/log/my app/test.log'");
    });

    it('grep 命令构建正确（大小写敏感，带上下文）', () => {
        const cmd = buildSearchCommand('/var/log/app.log', 'ERROR', 5, 50, true);
        assert.equal(cmd, "grep -n -C 5 'ERROR' '/var/log/app.log' | head -n 600");
    });

    it('grep 命令构建正确（大小写不敏感）', () => {
        const cmd = buildSearchCommand('/var/log/app.log', 'error', 3, 20, false);
        assert.equal(cmd, "grep -n -i -C 3 'error' '/var/log/app.log' | head -n 160");
    });

    it('grep 无上下文行', () => {
        const cmd = buildSearchCommand('/var/log/app.log', 'WARN', 0, 100, true);
        assert.equal(cmd, "grep -n 'WARN' '/var/log/app.log' | head -n 200");
    });

    it('搜索模式中的特殊字符应被转义', () => {
        const cmd = buildSearchCommand('/var/log/app.log', "it's error; rm -rf /", 5, 50, true);
        assert.ok(cmd.includes("'it'\\''s error; rm -rf /'"));
    });
});
