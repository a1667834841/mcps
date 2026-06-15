# mcps

通用 MCP 工具集合 — 把常用的运维 / 数据访问能力封装成标准化的 MCP Server，让 AI Agent（Claude Code、Codex CLI、OpenCode 等）可以直接调用。

每个 MCP 都是独立的 npm 包，可按需单独安装，也可以用一键脚本全部装好。

---

## MCP 一览

### 🗄️ `@ggball/mcp-database` — 数据库查询

| 项目       | 值                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------- |
| npm 包     | [`@ggball/mcp-database`](https://www.npmjs.com/package/@ggball/mcp-database)                        |
| 源码       | [`database/`](./database)                                                                           |
| 支持数据库 | **SQL Server** / **MySQL** / **OceanBase**                                                          |
| 默认行为   | 只读（仅允许 SELECT / SHOW / DESCRIBE / EXPLAIN），单次返回上限 1000 行，内置敏感字段脱敏           |

**提供的工具：**

| 工具                | 用途                               |
| ------------------- | ---------------------------------- |
| `list_databases`    | 列出实例上的所有数据库             |
| `list_tables`       | 列出指定库的所有表                 |
| `describe_table`    | 获取表结构（字段 / 类型 / 主键等） |
| `get_table_indexes` | 获取表索引                         |
| `get_table_stats`   | 获取表统计（行数、占用空间等）     |
| `execute_query`     | 执行 SQL（默认只读，受行数限制）   |

👉 详细配置、环境变量、使用示例见 [database/README.md](./database/README.md)

---

### 📋 `@ggball/mcp-ssh-log` — SSH 远程日志查看 / 搜索

| 项目     | 值                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------- |
| npm 包   | [`@ggball/mcp-ssh-log`](https://www.npmjs.com/package/@ggball/mcp-ssh-log)                      |
| 源码     | [`ssh_log/`](./ssh_log)                                                                         |
| 配置方式 | YAML 文件集中管理服务器、服务、日志目录三层结构                                                 |
| 默认行为 | 自动选取目录中最新日志文件，仅执行只读命令（tail / head / grep / ls / stat）                    |

**提供的工具：**

| 工具             | 用途                                                     |
| ---------------- | -------------------------------------------------------- |
| `list_servers`   | 列出所有已配置的服务器                                   |
| `list_logs`      | 列出日志目录配置，可按 server_id / service 过滤          |
| `list_log_files` | 列出指定目录下的日志文件（按修改时间倒序）               |
| `view_log`       | 查看日志内容（head / tail），不传文件名时自动选最新文件  |
| `search_log`     | 按关键字 / 正则搜索，返回匹配行及前后上下文              |

👉 详细配置、YAML schema、使用示例见 [ssh_log/README.md](./ssh_log/README.md)

---

### 🧠 配套 Skill

| Skill 目录                       | 作用                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| [`scripts/skills/mcp-database/`](./scripts/skills/mcp-database) | 教 Agent 何时、如何调用 database MCP（工具用法、server 选择规则、安全规范）       |
| [`scripts/skills/mcp-ssh-log/`](./scripts/skills/mcp-ssh-log)   | 教 Agent 何时、如何调用 ssh-log MCP（标准排查工作流、参数边界、常见踩坑）         |

Skill 会随一键脚本自动下载到本地，无需手动处理。

---

## 一键安装

脚本自动完成：**npm 全局安装 MCP 包** + **下载 Skill 文件** + **打印配置模板**。

凭证信息（数据库连接参数、SSH config 路径）需安装后手动填写。

### 🤖 Claude Code

**macOS / Linux**

```bash
curl -fsSL https://raw.githubusercontent.com/a1667834841/mcps/main/scripts/install/claude.sh | bash
```

**Windows PowerShell**

```powershell
irm https://raw.githubusercontent.com/a1667834841/mcps/main/scripts/install/claude.ps1 | iex
```

> Skill 默认安装到 `~/.claude/skills/`，可传参自定义：`curl ... | bash -s -- /your/path`

### 🤖 Codex CLI（OpenAI Codex）

**macOS / Linux**

```bash
curl -fsSL https://raw.githubusercontent.com/a1667834841/mcps/main/scripts/install/codex.sh | bash
```

**Windows PowerShell**

```powershell
irm https://raw.githubusercontent.com/a1667834841/mcps/main/scripts/install/codex.ps1 | iex
```

> Skill 默认下载到当前目录 `./skills/`，可传参自定义：`curl ... | bash -s -- /your/path`
>
> Codex CLI 无全局 Skill 目录，请将 SKILL.md 要点合并到项目的 `AGENTS.md`。

### 🤖 OpenCode

**macOS / Linux**

```bash
curl -fsSL https://raw.githubusercontent.com/a1667834841/mcps/main/scripts/install/opencode.sh | bash
```

**Windows PowerShell**

```powershell
irm https://raw.githubusercontent.com/a1667834841/mcps/main/scripts/install/opencode.ps1 | iex
```

> Skill 默认安装到 `~/.config/opencode/agent/`，可传参自定义：`curl ... | bash -s -- /your/path`

---

## 安装后配置

脚本执行完毕会打印配置模板，以下是各 Agent 的配置文件位置与格式速查。

### Claude Code

配置文件：`~/.claude.json`（全局）或项目根目录 `.mcp.json`

```json
{
  "mcpServers": {
    "<your-db-id>": {
      "command": "mcp-database",
      "env": {
        "DB_TYPE": "oceanbase",
        "DB_HOST": "<your-host>",
        "DB_PORT": "2881",
        "DB_USER": "<user>",
        "DB_PASSWORD": "<password>",
        "DB_DATABASE": "<database>",
        "DB_CHARSET": "utf8mb4",
        "DB_READONLY": "true",
        "DB_MAX_ROWS": "1000"
      }
    },
    "ssh-log": {
      "command": "mcp-ssh-log",
      "env": {
        "SSH_LOG_CONFIG": "<config.yaml 绝对路径>"
      }
    }
  }
}
```

### Codex CLI

配置文件：`~/.codex/config.toml`

```toml
[mcp_servers.<your-db-id>]
command = "mcp-database"

[mcp_servers.<your-db-id>.env]
DB_TYPE = "oceanbase"
DB_HOST = "<your-host>"
DB_PORT = "2881"
DB_USER = "<user>"
DB_PASSWORD = "<password>"
DB_DATABASE = "<database>"
DB_CHARSET = "utf8mb4"
DB_READONLY = "true"
DB_MAX_ROWS = "1000"

[mcp_servers.ssh-log]
command = "mcp-ssh-log"

[mcp_servers.ssh-log.env]
SSH_LOG_CONFIG = "<config.yaml 绝对路径>"
```

### OpenCode

配置文件：`~/.config/opencode/opencode.json`（全局）或项目 `opencode.json`

```json
{
  "mcp": {
    "<your-db-id>": {
      "type": "local",
      "command": ["mcp-database"],
      "environment": {
        "DB_TYPE": "oceanbase",
        "DB_HOST": "<your-host>",
        "DB_PORT": "2881",
        "DB_USER": "<user>",
        "DB_PASSWORD": "<password>",
        "DB_DATABASE": "<database>",
        "DB_CHARSET": "utf8mb4",
        "DB_READONLY": "true",
        "DB_MAX_ROWS": "1000"
      }
    },
    "ssh-log": {
      "type": "local",
      "command": ["mcp-ssh-log"],
      "environment": {
        "SSH_LOG_CONFIG": "<config.yaml 绝对路径>"
      }
    }
  }
}
```

---

## 手动安装

不想走脚本时，也可以手动操作：

```bash
# 1. 安装 npm 包
npm i -g @ggball/mcp-database @ggball/mcp-ssh-log

# 2. 下载 Skill（从 GitHub）
mkdir -p scripts/skills/mcp-database scripts/skills/mcp-ssh-log
curl -fsSL https://raw.githubusercontent.com/a1667834841/mcps/main/scripts/skills/mcp-database/SKILL.md      -o scripts/skills/mcp-database/SKILL.md
curl -fsSL https://raw.githubusercontent.com/a1667834841/mcps/main/scripts/skills/mcp-database/reference.md  -o scripts/skills/mcp-database/reference.md
curl -fsSL https://raw.githubusercontent.com/a1667834841/mcps/main/scripts/skills/mcp-ssh-log/SKILL.md       -o scripts/skills/mcp-ssh-log/SKILL.md
curl -fsSL https://raw.githubusercontent.com/a1667834841/mcps/main/scripts/skills/mcp-ssh-log/reference.md   -o scripts/skills/mcp-ssh-log/reference.md
```

---

## 安全提醒

- `ssh_log/config.yaml` 含明文 SSH 密码，本仓库 `.gitignore` 默认忽略不提交；部署时同样要 gitignore 或放在仓库之外，通过 `SSH_LOG_CONFIG` 环境变量指向
- 数据库 MCP 默认 `DB_READONLY=true`，如需写入请显式关闭并谨慎使用
- 凭证请使用最小权限账户，禁止使用生产 root/sa

## License

MIT
