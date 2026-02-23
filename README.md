# claude-portainer-plugin

Claude Code 插件，通过 Portainer REST API 管理 Docker 容器和服务。

## 功能

- **环境管理** — 列出、查看 Portainer 环境和连接状态
- **Stack 全生命周期** — 创建、更新、启停、删除、Webhook 重部署、Git 重部署
- **容器管理** — 列出、启停重启、查看日志和资源统计
- **镜像管理** — 列出、拉取、删除、清理未使用镜像
- **网络和卷** — CRUD 操作和资源清理
- **Swarm 服务** — 列出、更新、查看日志
- **系统监控** — Docker 信息、磁盘使用、系统清理
- **Webhook 管理** — 创建、触发、管理 Webhook

## 前置要求

- [Claude Code](https://claude.ai/code) CLI
- Portainer CE 2.19+（已验证 2.24.1 和 2.33.7）
- Portainer API Key 或管理员账号

## 安装

### 方式一：plugin 命令（推荐）

在 Claude Code 中运行：

```
/plugin install portainer@hangox
```

或通过 CLI：

```bash
claude plugin install portainer@hangox
```

### 方式二：npx skills-installer（跨客户端通用）

适用于 Cursor、Windsurf 等多种 AI 编程工具：

```bash
# 安装到当前项目（推荐）
npx skills-installer install @hangox/claude-portainer-plugin/portainer -p --client claude-code

# 全局安装（所有项目可用）
npx skills-installer install @hangox/claude-portainer-plugin/portainer --client claude-code
```

### 方式三：手动克隆

```bash
git clone https://github.com/hangox/claude-portainer-plugin.git ~/.claude/plugins/claude-portainer-plugin
```

重启 Claude Code 后插件自动生效。

## 配置

插件按以下优先级自动获取 Portainer 连接信息：

### 方式一：环境变量（推荐）

```bash
export PORTAINER_URL="https://portainer.example.com"
export PORTAINER_API_KEY="ptr_your_api_key_here"
export PORTAINER_ENDPOINT_ID="1"  # 可选，默认 1
```

### 方式二：项目 CLAUDE.md

在项目的 `CLAUDE.md` 中添加 Portainer 配置段落：

```markdown
## Portainer 信息
- 管理地址: https://portainer.example.com
- Portainer ID: 2
```

### 方式三：交互式引导

首次使用时，插件会自动询问 Portainer URL 和认证信息。

## 使用示例

```
"列出所有 stack"
"部署这个 docker-compose.yml 到 Portainer"
"重启 nginx 容器"
"查看 redis 的日志"
"触发 webhook 重新部署 my-stack"
"清理未使用的镜像"
"查看 Docker 磁盘使用情况"
```

## 生成 API Key

1. 登录 Portainer Web UI
2. 点击头像 → **My Account**
3. 滚动到 **Access tokens** 部分
4. 点击 **Add access token**，输入描述，点击创建
5. 复制生成的 `ptr_` 开头的 API Key

## 测试

项目包含自动化测试，使用 Docker 启动独立的 Portainer 测试环境：

```bash
cd tests
npm install
npx tsx run-tests.ts    # 一键运行（自动 setup + test + teardown）
```

测试覆盖：28 个用例（14 P0 + 10 P1 + 3 错误处理 + 1 清理），0 失败。

## 版本兼容性

| Portainer 版本 | 状态 |
|---------------|------|
| CE 2.33.7 | 已验证 |
| CE 2.24.1 | 已验证（自动化测试） |
| CE 2.19+ | 最低支持 |

## License

MIT
