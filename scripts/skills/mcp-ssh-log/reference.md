# MCP SSH-Log 配置参考

## 配置文件结构（YAML）

由 `SSH_LOG_CONFIG` 环境变量指向（默认 `./config.yaml`），结构：

```yaml
servers:
  - id: <唯一标识>          # 必填，agent 调用时用的 server_id
    name: "<可读名称>"      # 必填
    host: "<IP 或域名>"     # 必填
    port: 22                # 默认 22，可省略
    username: "<用户>"      # 必填
    password: "<密码>"      # 必填
    logs:                   # 至少一项
      - name: "<日志名>"    # 必填，展示用
        service: "<服务名>" # 必填，用于 list_logs 过滤
        path: "<绝对路径>"  # 必填，必须以 / 开头
```

## Schema 校验要点

| 字段                                             | 规则                        |
| ------------------------------------------------ | --------------------------- |
| `servers`                                        | 至少 1 个                   |
| `id` / `name` / `host` / `username` / `password` | 非空字符串                  |
| `port`                                           | 整数 1–65535，默认 22       |
| `logs`                                           | 每个 server 至少 1 个       |
| `path`                                           | 必须以 `/` 开头（绝对路径） |

校验失败 server 会启动失败并打印 `配置验证失败` 错误。

## 增加新服务器示例

```yaml
servers:
  - id: prod-server-1
    name: "生产服务器 1"
    host: "<your-host>"
    port: 22
    username: "<your-user>"
    password: "<your-password>"
    logs:
      - name: "应用输出日志"
        service: "<service-name>"
        path: "/var/log/<service-name>/output"

  - id: prod-server-2
    name: "生产服务器 2"
    host: "<your-host>"
    username: "<your-user>"
    password: "<your-password>"
    logs:
      - name: "应用输出"
        service: "<service-name>"
        path: "/var/log/<service-name>/output"
      - name: "错误日志"
        service: "<service-name>"
        path: "/var/log/<service-name>/error"
```

## 注册到 Agent MCP

通用 JSON 格式（适用 Qoder / Claude Code / OpenCode）：

```json
"ssh-log": {
  "command": "mcp-ssh-log",
  "env": {
    "SSH_LOG_CONFIG": "<本地 ssh_log/config.yaml 绝对路径>"
  }
}
```

Codex CLI（TOML）：

```toml
[mcp_servers.ssh-log]
command = "mcp-ssh-log"
env = { SSH_LOG_CONFIG = "<本地 ssh_log/config.yaml 绝对路径>" }
```

## 修改后生效

1. 编辑 yaml 保存
2. 在 Agent 中 reload `ssh-log` 这个 MCP（或重启 Agent）
3. 用 `ssh-log.list_servers` 验证

## 常见错误排查

| 现象                                             | 原因                                 | 解决                                     |
| ------------------------------------------------ | ------------------------------------ | ---------------------------------------- |
| `无法读取配置文件`                               | 路径错或权限不足                     | 检查 `SSH_LOG_CONFIG` 绝对路径、文件权限 |
| `YAML 解析失败`                                  | 缩进/引号错                          | 用 yaml lint 校验                        |
| `配置验证失败: ... path: 日志路径必须是绝对路径` | path 没以 `/` 开头                   | 改为绝对路径                             |
| SSH 连接超时                                     | 网络/防火墙                          | 本机 `ssh user@host` 验证；检查端口 22   |
| `Authentication failed`                          | 用户名/密码错                        | 在终端用同凭证 ssh 验证                  |
| `view_log` 返回空                                | 文件存在但目录中无符合命名的最新文件 | 先 `list_log_files` 看实际文件名         |

## 安全提醒

- `config.yaml` 含明文密码，务必加入 `.gitignore`，不要提交
- 生产环境建议改用 SSH key（如包后续支持），暂不要把生产凭证写入开发环境配置
