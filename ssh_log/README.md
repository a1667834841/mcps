# MCP SSH Log Server

通过 SSH 远程查看与搜索服务器日志的 MCP（Model Context Protocol）服务器，基于 TypeScript + Node.js 构建。

## 简介

`@ggball/mcp-ssh-log` 让 AI 助手（如 Claude Desktop、Qoder 等 MCP Client）可以安全、统一地访问多台远程服务器上的日志目录：

- 通过 YAML 配置文件集中管理服务器与日志目录
- 自动按修改时间挑选目录中最新的日志文件，无需手动指定文件名
- 支持 `head` / `tail` 查看，以及关键字 / 正则搜索并返回上下文
- 内置 SSH 连接池，复用连接以提升性能

## 功能特性

- 列出所有已配置的服务器及其日志服务清单
- 按服务器或服务名过滤日志目录配置
- 列出指定日志目录内的所有文件（按修改时间倒序）
- 查看日志文件开头或末尾若干行（1–1000）
- 在日志文件中按关键字 / 正则搜索，返回匹配行及前后上下文（0–20 行）
- 配置 Schema 校验（基于 Zod），启动时即时报错

## 安装

### 通过 npm 全局安装

```bash
npm install -g @ggball/mcp-ssh-log
```

### 通过 npx 直接运行

```bash
npx @ggball/mcp-ssh-log
```

### 从源码构建

环境要求：

- Node.js ≥ 18.0.0
- npm ≥ 9.0.0
- 目标服务器需开启 SSH 访问，且具备 `tail` / `head` / `grep` / `ls` / `stat` 等基础命令

```bash
npm install
npm run build
npm start
```

## 配置

服务器与日志目录通过 YAML 配置文件管理。

### 配置文件路径

加载优先级：

1. 环境变量 `SSH_LOG_CONFIG`（绝对或相对路径）
2. 当前工作目录下的 `./config.yaml`

### 配置示例

将 `config.example.yaml` 复制为 `config.yaml` 后按需修改：

```yaml
servers:
  - id: prod-server-1            # 服务器唯一 ID（工具调用时使用）
    name: "生产服务器 1"          # 展示名称
    host: "192.168.1.100"
    port: 22
    username: "admin"
    password: "your-password-here"
    logs:
      - name: "应用输出日志"      # 日志展示名
        service: "user-service"  # 所属服务名（可用于过滤）
        path: "/var/log/user-service/output"   # 日志目录绝对路径
      - name: "错误日志"
        service: "user-service"
        path: "/var/log/user-service/error"
      - name: "Nginx 访问日志"
        service: "nginx"
        path: "/var/log/nginx"

  - id: prod-server-2
    name: "生产服务器 2"
    host: "192.168.1.101"
    port: 22
    username: "admin"
    password: "your-password-here"
    logs:
      - name: "网关日志"
        service: "api-gateway"
        path: "/var/log/api-gateway/output"
```

### 配置约束

- `path` 必须是绝对路径（以 `/` 开头），且为日志**目录**而非单个文件
- `id`、`name`、`host`、`username`、`password`、`logs[].name`、`logs[].service` 不能为空
- `port` 默认 `22`，取值 1–65535
- 至少需配置 1 个 server，每个 server 至少配置 1 条日志

## 在 MCP Client 中接入

以 Claude Desktop / Qoder 的 `mcp.json` 为例：

```json
{
  "mcpServers": {
    "ssh-log": {
      "command": "npx",
      "args": ["-y", "@ggball/mcp-ssh-log"],
      "env": {
        "SSH_LOG_CONFIG": "D:/path/to/your/config.yaml"
      }
    }
  }
}
```

> 不设置 `SSH_LOG_CONFIG` 时，会从启动进程的工作目录加载 `config.yaml`。

## 提供的 MCP 工具

| 工具名           | 说明                                                                       |
| ---------------- | -------------------------------------------------------------------------- |
| `list_servers`   | 列出所有配置的服务器及其服务列表                                           |
| `list_logs`      | 列出日志目录配置，可按 `server_id` / `service` 过滤                        |
| `list_log_files` | 列出指定日志目录中的文件（按修改时间倒序）                                 |
| `view_log`       | 查看日志内容，支持 `head` / `tail` 模式；不传 `file_name` 时自动选最新文件 |
| `search_log`     | 在日志中按关键字 / 正则搜索，返回匹配行及前后上下文                        |

### 工具参数

#### `list_servers`
无参数。

#### `list_logs`

| 参数        | 类型   | 必填 | 说明             |
| ----------- | ------ | ---- | ---------------- |
| `server_id` | string | 否   | 按服务器 ID 过滤 |
| `service`   | string | 否   | 按服务名过滤     |

#### `list_log_files`

| 参数        | 类型   | 必填 | 说明                                     |
| ----------- | ------ | ---- | ---------------------------------------- |
| `server_id` | string | 是   | 服务器 ID                                |
| `log_path`  | string | 是   | 日志目录路径（须与配置中的 `path` 一致） |

#### `view_log`

| 参数        | 类型             | 必填 | 默认     | 说明                                   |
| ----------- | ---------------- | ---- | -------- | -------------------------------------- |
| `server_id` | string           | 是   | —        | 服务器 ID                              |
| `log_path`  | string           | 是   | —        | 日志目录路径                           |
| `file_name` | string           | 否   | 最新文件 | 日志文件名，缺省时自动选目录中最新文件 |
| `mode`      | `head` \| `tail` | 否   | `tail`   | 查看模式                               |
| `lines`     | number           | 否   | `100`    | 查看行数（1–1000）                     |

#### `search_log`

| 参数             | 类型    | 必填 | 默认     | 说明                            |
| ---------------- | ------- | ---- | -------- | ------------------------------- |
| `server_id`      | string  | 是   | —        | 服务器 ID                       |
| `log_path`       | string  | 是   | —        | 日志目录路径                    |
| `file_name`      | string  | 否   | 最新文件 | 不传则搜索目录中最新文件        |
| `pattern`        | string  | 是   | —        | 关键字或正则表达式              |
| `context_lines`  | number  | 否   | `5`      | 匹配行前后各 N 行上下文（0–20） |
| `max_results`    | number  | 否   | `50`     | 最大匹配结果数（1–200）         |
| `case_sensitive` | boolean | 否   | `true`   | 是否区分大小写                  |

## 开发

```bash
npm install            # 安装依赖
npm run build          # 编译 TypeScript 到 dist/
npm run watch          # 增量编译
npm run dev            # 编译并直接运行
npm start              # 运行已构建产物

# 测试
npm test               # 运行所有测试
npm run test:schema    # 配置 Schema 校验测试
npm run test:loader    # 配置加载器测试
npm run test:provider  # Provider 测试
npm run test:ssh       # SSH 命令测试
```

## 项目结构

```
ssh_log/
├── src/
│   ├── config/         # YAML 加载与 Zod schema 校验
│   ├── providers/      # 服务器 / 日志配置提供者（基于配置文件）
│   ├── ssh/            # SSH 连接管理与日志命令封装
│   ├── types/          # 公共类型定义
│   └── index.ts        # MCP Server 入口与工具注册
├── tests/              # 单元 / 集成测试
├── config.example.yaml # 配置示例
├── package.json
└── tsconfig.json
```

## 安全建议

- `config.yaml` 包含明文 SSH 凭证：本仓库根 `.gitignore` 默认忽略 `ssh_log/config.yaml`，不会被提交。下游使用者在自己仓库里部署时，请同样在 `.gitignore` 中排除 `config.yaml`，或把配置文件放在仓库之外的受控目录并通过环境变量 `SSH_LOG_CONFIG` 指向它
- MCP 工具仅执行只读类命令（`tail` / `head` / `grep` / `ls` / `stat`），不会对远程文件做写操作
- 建议为日志查询专门创建低权限账号，仅授予对应日志目录的读取权限

## License

MIT
