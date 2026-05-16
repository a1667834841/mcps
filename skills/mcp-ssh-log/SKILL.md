---
name: mcp-ssh-log
description: View and search remote application logs over SSH via the @ggball/mcp-ssh-log MCP server. Use when the user asks to look at server logs, tail/head a log file, search for ERROR/WARN/exception keywords in logs, list log files on a remote host, or troubleshoot a backend service.
---

# MCP SSH Log

通过 `@ggball/mcp-ssh-log` 在远程服务器上查看与搜索日志。配置文件 `config.yaml` 集中管理服务器、服务、日志目录三个层级，agent 通过 `server_id` + `log_path` 定位目标日志目录。



## 工具一览

| 工具             | 用途                                    | 关键参数                                                                                              |
| ---------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `list_servers`   | 列出所有已配置服务器                    | 无                                                                                                    |
| `list_logs`      | 列出日志目录配置                        | `server_id?`, `service?`                                                                              |
| `list_log_files` | 列出某目录下的日志文件（按 mtime 倒序） | `server_id`, `log_path`                                                                               |
| `view_log`       | 查看日志内容（head/tail）               | `server_id`, `log_path`, `file_name?`, `mode?`, `lines?`                                              |
| `search_log`     | 关键字/正则搜索 + 上下文                | `server_id`, `log_path`, `pattern`, `file_name?`, `context_lines?`, `max_results?`, `case_sensitive?` |

**`file_name` 不传默认操作目录中最新文件**，这是定位线上当前问题的常用模式。

## 标准排查工作流

### 场景 1：看最新输出日志

```
ssh-log.view_log(
  server_id="<your-server-id>",
  log_path="/var/log/<service>/output",
  mode="tail",
  lines=200
)
```

### 场景 2：搜索今日异常

```
ssh-log.search_log(
  server_id="<your-server-id>",
  log_path="/var/log/<service>/error",
  pattern="Exception|ERROR",
  context_lines=10,
  max_results=50,
  case_sensitive=false
)
```

### 场景 3：查具体日期日志

先 `list_log_files` 拿到对应日期文件名（如 `output-2026-05-14-0.log`），再传给 `view_log` / `search_log` 的 `file_name`。

### 场景 4：定位某次请求

通常组合：`search_log(pattern="<traceId 或业务唯一标识>", context_lines=20)`，再用 `file_name` 锁定到具体文件深掘。

## 参数边界

| 参数                        | 范围         | 默认 |
| --------------------------- | ------------ | ---- |
| `view_log.lines`            | 1–1000       | 100  |
| `view_log.mode`             | head / tail  | tail |
| `search_log.context_lines`  | 0–20         | 5    |
| `search_log.max_results`    | 1–200        | 50   |
| `search_log.case_sensitive` | true / false | true |

超过上限的请求请分多次拉取，不要直接传非法值。

## 选择日志目录的规则

- 用户问 "看下日志 / 业务日志 / 接口日志" → `output`
- 用户问 "报错 / 异常 / Exception / 5xx" → `error`
- 用户问 "调试 / 详细 / SQL / DEBUG" → `debug`

不确定时优先 `output`，再扫 `error`。

## 常见踩坑

- 路径必须是**绝对路径**（schema 校验要求 `/` 开头），不能用相对路径或 `~`
- `pattern` 是 `grep -E` 风格扩展正则，元字符记得转义（如 `\(`、`\.`、`\$`）
- `case_sensitive=false` 等价于 `grep -i`；如果 `pattern` 里写了 `[A-Z]` 这类字符类，是否不区分大小写取决于远程 grep 实现，调试时建议改用显式分支（如 `(ERROR|error)`）避免别扭
- 日志文件名带日期（`output-YYYY-MM-DD-N.log`）；想看"今天"用 `file_name` 不传由 server 自动选最新
- 大日志（>50MB）尽量用 `search_log` 而不是 `view_log` 全拉

## 进阶参考

- 新增服务器、修改日志目录、yaml schema：[reference.md](reference.md)
