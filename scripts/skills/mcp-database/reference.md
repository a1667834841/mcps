# MCP Database 配置参考

## 各 Agent 配置文件位置

| Agent | 配置文件 |
|---|---|
| Qoder | `C:\Users\<user>\AppData\Roaming\Qoder\SharedClientCache\mcp.json` 或项目 `.mcp.json` |
| Claude Code | `~/.claude.json` 或项目 `.mcp.json` |
| Codex CLI | `~/.codex/config.toml` |
| OpenCode | `~/.config/opencode/opencode.json` 或项目 `opencode.json` |

## 添加一个新的数据库 Server（JSON 示例）

在 `mcpServers` / `mcp` 对象中追加一项，命令统一用 `mcp-database`，server 名自定义（建议带库/环境标识）：

```json
"oceanbase-prod": {
  "command": "mcp-database",
  "env": {
    "DB_TYPE": "oceanbase",
    "DB_HOST": "10.x.x.x",
    "DB_PORT": "2881",
    "DB_USER": "root",
    "DB_PASSWORD": "***",
    "DB_DATABASE": "mydb",
    "DB_CHARSET": "utf8mb4",
    "DB_READONLY": "true",
    "DB_MAX_ROWS": "1000"
  }
}
```

## 环境变量速查

### 通用（所有类型）

| 变量 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `DB_TYPE` | 是 | `sqlserver` | `sqlserver` / `mysql` / `oceanbase` |
| `DB_READONLY` | 否 | `true` | `false` 才允许写入 |
| `DB_MAX_ROWS` | 否 | `1000` | 单次查询最大返回行数 |
| `DB_REQUEST_TIMEOUT` | 否 | `30000` | 毫秒 |

### MySQL / OceanBase（DB_TYPE=mysql 或 oceanbase）

| 变量 | 默认 | 说明 |
|---|---|---|
| `DB_HOST` | localhost | 主机 |
| `DB_PORT` | 3306 / 2881 | 端口 |
| `DB_USER` | root | 用户名 |
| `DB_PASSWORD` | (空) | 密码 |
| `DB_DATABASE` | - | 默认库 |
| `DB_CHARSET` | utf8mb4 | 字符集 |

### SQL Server（DB_TYPE=sqlserver）

| 变量 | 默认 | 说明 |
|---|---|---|
| `SQLSERVER_HOST` | localhost | 主机 |
| `SQLSERVER_PORT` | 1433 | 端口 |
| `SQLSERVER_USER` | sa | 用户名 |
| `SQLSERVER_PASSWORD` | (空) | 密码 |
| `SQLSERVER_DATABASE` | master | 默认库 |
| `SQLSERVER_ENCRYPT` | true | TLS 加密 |
| `SQLSERVER_TRUST_SERVER_CERTIFICATE` | true | 信任自签证书 |

## 修改后生效

1. 保存配置文件
2. 重启 Agent（或在 MCP 面板中 reload 对应 server）
3. 用 `<新server>.list_databases` 验证连通

## 常见错误

| 现象 | 原因 | 解决 |
|---|---|---|
| `ECONNREFUSED` | 端口不通 / 服务未启 | 检查 `DB_HOST`/`DB_PORT`、防火墙 |
| `ER_ACCESS_DENIED_ERROR` | 用户名/密码错 | 核对凭证；OceanBase 注意是否需 `user@tenant` |
| `Readonly mode` 报错 | 默认只读拦截 DML | 显式设 `DB_READONLY=false`（谨慎） |
| 中文乱码 | charset 不匹配 | MySQL/OceanBase 设 `DB_CHARSET=utf8mb4` |
