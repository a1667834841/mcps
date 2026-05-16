# mcps

通用 MCP 工具集，包含两个开箱即用的 MCP Server 与配套的 Skill：

| 模块                      | npm 包                                                                       | 作用                                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [`database/`](./database) | [`@ggball/mcp-database`](https://www.npmjs.com/package/@ggball/mcp-database) | 通过 MCP 访问 SQL Server / MySQL / OceanBase，支持 list_databases、list_tables、describe_table、execute_query 等工具，默认只读 |
| [`ssh_log/`](./ssh_log)   | [`@ggball/mcp-ssh-log`](https://www.npmjs.com/package/@ggball/mcp-ssh-log)   | 通过 SSH 远程查看 / 搜索应用日志（tail、head、grep + 上下文），按 yaml 配置集中管理服务器与日志目录                            |
| [`skills/`](./skills)     | —                                                                            | 配套 Skill：教 Agent 何时、如何调用上述两个 MCP（包含工具用法、server 选择规则、安全规范、排查工作流）                         |

---

## 一句话让 Agent 自动安装

把下面对应平台的整段话直接发给你的 AI Agent，它会自行完成 **包安装 + MCP 注册 + Skill 部署**。复制前请把示例里的数据库、SSH 凭证替换成你自己的环境。

### 🤖 Claude Code

```
请帮我安装并配置 mcps 工具集：
1) 全局安装 npm 包：`npm i -g @ggball/mcp-database @ggball/mcp-ssh-log`；
2) 部署 Skill（包自带，无需克隆仓库）：
   `mcp-database install-skill ~/.claude/skills && mcp-ssh-log install-skill ~/.claude/skills`；
3) 在 `~/.claude.json`（或当前项目的 `.mcp.json`）的 `mcpServers` 中追加两个条目：
   - `<your-db-server-id>`：command=`mcp-database`，env={DB_TYPE:"oceanbase", DB_HOST:"<your-db-host>", DB_PORT:"2881", DB_USER:"<your-user>", DB_PASSWORD:"<your-password>", DB_DATABASE:"<your-database>", DB_CHARSET:"utf8mb4", DB_READONLY:"true", DB_MAX_ROWS:"1000"}
   - `ssh-log`：command=`mcp-ssh-log`，env={SSH_LOG_CONFIG:"<本地 ssh_log/config.yaml 的绝对路径>"}（参考仓库内 `ssh_log/config.example.yaml` 创建你的 config.yaml）；
4) 重新加载 MCP，用 `<your-db-server-id>.list_databases` 和 `ssh-log.list_servers` 各调用一次验证连通。失败时打印错误并停下让我处理。
```

### 🤖 Codex CLI（OpenAI Codex）

~~~
请帮我安装并配置 mcps 工具集：
1) 全局安装 npm 包：`npm i -g @ggball/mcp-database @ggball/mcp-ssh-log`；
2) 部署 Skill 并合并到 AGENTS.md（包自带，无需克隆仓库）：先运行
   `mcp-database install-skill ./tmp-skills && mcp-ssh-log install-skill ./tmp-skills`，
   然后把 `tmp-skills/mcp-database/SKILL.md` 和 `tmp-skills/mcp-ssh-log/SKILL.md` 的核心要点（server 选择规则、工具列表、安全规范）合并写入项目根目录的 `AGENTS.md`，完成后可删除 `tmp-skills`；
3) 在 `~/.codex/config.toml` 中追加两个 mcp_server 段：
   ```toml
   [mcp_servers.<your-db-server-id>]
   command = "mcp-database"
   env = { DB_TYPE = "oceanbase", DB_HOST = "<your-db-host>", DB_PORT = "2881", DB_USER = "<your-user>", DB_PASSWORD = "<your-password>", DB_DATABASE = "<your-database>", DB_CHARSET = "utf8mb4", DB_READONLY = "true", DB_MAX_ROWS = "1000" }

   [mcp_servers.ssh-log]
   command = "mcp-ssh-log"
   env = { SSH_LOG_CONFIG = "<本地 ssh_log/config.yaml 绝对路径>" }
   ```
4) 重启 codex 进程，调用 `<your-db-server-id>.list_databases` 和 `ssh-log.list_servers` 验证。失败时打印错误并停下让我处理。
~~~

### 🤖 OpenCode

~~~
请帮我安装并配置 mcps 工具集：
1) 全局安装 npm 包：`npm i -g @ggball/mcp-database @ggball/mcp-ssh-log`；
2) 部署 Skill（包自带，无需克隆仓库）：
   `mcp-database install-skill ~/.config/opencode/agent && mcp-ssh-log install-skill ~/.config/opencode/agent`；
   之后按 OpenCode 的约定把每个 SKILL.md 调整为对应的 agent 描述文件即可；
3) 在 `~/.config/opencode/opencode.json`（或项目 `opencode.json`）的 `mcp` 字段中追加：
   ```json
   "<your-db-server-id>": {
     "type": "local",
     "command": ["mcp-database"],
     "environment": {
       "DB_TYPE": "oceanbase", "DB_HOST": "<your-db-host>", "DB_PORT": "2881",
       "DB_USER": "<your-user>", "DB_PASSWORD": "<your-password>",
       "DB_DATABASE": "<your-database>", "DB_CHARSET": "utf8mb4",
       "DB_READONLY": "true", "DB_MAX_ROWS": "1000"
     }
   },
   "ssh-log": {
     "type": "local",
     "command": ["mcp-ssh-log"],
     "environment": { "SSH_LOG_CONFIG": "<本地 ssh_log/config.yaml 绝对路径>" }
   }
   ```
4) 重启 opencode，分别调用 `<your-db-server-id>.list_databases` 和 `ssh-log.list_servers` 验证。失败时打印错误并停下让我处理。
~~~

---

## 手动安装 Skill（不克隆仓库）

两个 npm 包都内置了其配套 Skill，全局安装后一行部署：

```bash
mcp-database install-skill <目标目录>   # 生成 <目标目录>/mcp-database/{SKILL.md,reference.md}
mcp-ssh-log  install-skill <目标目录>   # 生成 <目标目录>/mcp-ssh-log/{SKILL.md,reference.md}
```

常用目标目录：Claude Code 用 `~/.claude/skills`；OpenCode 用 `~/.config/opencode/agent`；Codex CLI 可随意存放然后合并到 `AGENTS.md`。

---

## 手动配置参考

不想走 Agent 自动化时，直接看：

- 数据库 MCP：[skills/mcp-database/SKILL.md](./skills/mcp-database/SKILL.md) + [reference.md](./skills/mcp-database/reference.md)
- SSH 日志 MCP：[skills/mcp-ssh-log/SKILL.md](./skills/mcp-ssh-log/SKILL.md) + [reference.md](./skills/mcp-ssh-log/reference.md)
- 各模块详细说明：[database/README.md](./database/README.md) ｜ [ssh_log/README.md](./ssh_log/README.md)

## 安全提醒

- `ssh_log/config.yaml` 含明文 SSH 密码，本仓库根 `.gitignore` 默认忽略不提交；你自己部署时同样要 gitignore 或放在仓库之外，通过 `SSH_LOG_CONFIG` 环境变量指向
- 数据库 MCP 默认 `DB_READONLY=true`，如需写入请显式关闭并谨慎使用
- 凭证请使用最小权限账户，禁止使用生产 root/sa
