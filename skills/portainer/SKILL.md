---
name: portainer
description: Portainer CE 容器管理专家，通过 REST API 管理 Docker 容器、Stack、镜像、网络、卷和 Webhook。当用户需要管理 Docker 容器、查看容器状态、部署服务、操作 Portainer、管理 Stack、查看容器日志、拉取镜像、触发 Webhook 重部署时自动触发。关键词：portainer、容器管理、docker 部署、stack 部署、容器状态、镜像管理、容器日志、webhook
---

# Portainer CE 容器管理 Skill

## 版本与兼容性

- 最低版本：Portainer CE 2.19+
- 已验证版本：2.33.7
- 版本探测：先调 `GET $PORTAINER_URL/api/system/status`，若 404 则回退 `GET $PORTAINER_URL/api/status`

## 环境变量规范

| 变量名 | 必需 | 说明 | 示例 |
|--------|------|------|------|
| `PORTAINER_URL` | 是 | Portainer 地址（不含 `/api`） | `https://portainer.example.com` |
| `PORTAINER_API_KEY` | 推荐 | API Key（`ptr_` 开头） | `ptr_abc123...` |
| `PORTAINER_ENDPOINT_ID` | 否 | 环境 ID，默认 `1` | `2` |
| `PORTAINER_USERNAME` | 否 | JWT 回退用户名 | `admin` |
| `PORTAINER_PASSWORD` | 否 | JWT 回退密码 | - |

**curl 简写约定：**
- `$AUTH` → `-H "X-API-Key: $PORTAINER_API_KEY"` 或 `-H "Authorization: Bearer $TOKEN"`
- `$EP` → `$PORTAINER_URL/api/endpoints/$PORTAINER_ENDPOINT_ID`（Docker 代理前缀）

## 配置发现流程

按以下顺序获取配置，优先级从高到低：

```
1. 检查环境变量 PORTAINER_URL / PORTAINER_API_KEY
   ├─ 有 → 直接使用
   └─ 无 → 继续
2. 解析当前项目 CLAUDE.md 中的 Portainer 段落
   ├─ 找到 → 提取 URL、Endpoint ID、认证信息
   └─ 未找到 → 继续
3. 交互式询问用户
   ├─ 询问 Portainer URL
   ├─ 询问认证方式（API Key / 用户名密码）
   └─ 若无 Endpoint ID → 调用 GET /api/endpoints 列出可用环境供选择
```

**CLAUDE.md 解析规则：**
- 搜索 `Portainer` 相关段落，提取 URL（`管理地址`/`Portainer URL`）
- 提取 `Portainer ID`/`Endpoint ID` 作为 `PORTAINER_ENDPOINT_ID`
- 若包含用户名密码，用于 JWT 认证回退

## 认证流程

### 方式一：API Key（推荐）

```bash
curl -s $PORTAINER_URL/api/system/status \
  -H "X-API-Key: $PORTAINER_API_KEY"
```

### 方式二：JWT Token（回退）

```bash
# 1. 获取 Token
TOKEN=$(curl -s $PORTAINER_URL/api/auth \
  -H "Content-Type: application/json" \
  -d '{"Username":"'$PORTAINER_USERNAME'","Password":"'$PORTAINER_PASSWORD'"}' \
  | jq -r '.jwt')

# 2. 使用 Token
curl -s $PORTAINER_URL/api/stacks $AUTH
# 其中 $AUTH = -H "Authorization: Bearer $TOKEN"
```

**认证验证：** 连接后立即调用 `GET /api/system/status` 验证认证有效性。

## 功能模块

### 模块 1：环境管理（P0）

```bash
# 列出所有环境
curl -s $PORTAINER_URL/api/endpoints $AUTH | jq '.[] | {Id, Name, Type, Status}'

# 获取环境详情
curl -s $PORTAINER_URL/api/endpoints/$PORTAINER_ENDPOINT_ID $AUTH

# 环境类型：1=Docker本地, 2=Docker代理, 3=Azure, 4=Edge代理, 5=K8s本地, 6=K8s代理, 7=K8s Edge代理
# 状态：1=运行中, 2=离线
```

首次使用时自动列出可用环境，帮助用户选择正确的 Endpoint ID。

### 模块 2：Stack 全生命周期（P0）

```bash
# 列出所有 Stack
curl -s $PORTAINER_URL/api/stacks $AUTH | jq '.[] | {Id, Name, Status, Type}'

# 创建 Stack（Compose 方式）
# 注意：路径中 type 在不同版本有差异：
#   2.20+ 数字格式: /api/stacks/create/2/string
#   部分版本别名: /api/stacks/create/standalone/string
# 建议先尝试数字格式，失败则用别名
curl -s -X POST "$PORTAINER_URL/api/stacks/create/2/string?endpointId=$PORTAINER_ENDPOINT_ID" \
  $AUTH -H "Content-Type: application/json" \
  -d '{
    "Name": "my-stack",
    "StackFileContent": "version: \"3\"\nservices:\n  web:\n    image: nginx:1.27",
    "Env": [{"name": "KEY", "value": "val"}]
  }'

# 创建 Swarm Stack（type=1 表示 Swarm）
curl -s -X POST "$PORTAINER_URL/api/stacks/create/1/string?endpointId=$PORTAINER_ENDPOINT_ID" \
  $AUTH -H "Content-Type: application/json" \
  -d '{
    "Name": "my-swarm-stack",
    "SwarmID": "<swarm-id>",
    "StackFileContent": "...",
    "Env": []
  }'

# 获取 Stack 的 compose 文件内容
curl -s $PORTAINER_URL/api/stacks/{stackId}/file $AUTH | jq -r '.StackFileContent'

# 更新 Stack
curl -s -X PUT "$PORTAINER_URL/api/stacks/{stackId}?endpointId=$PORTAINER_ENDPOINT_ID" \
  $AUTH -H "Content-Type: application/json" \
  -d '{
    "StackFileContent": "...",
    "Env": [{"name": "KEY", "value": "val"}],
    "Prune": true
  }'

# 启动 / 停止 Stack
curl -s -X POST "$PORTAINER_URL/api/stacks/{stackId}/start?endpointId=$PORTAINER_ENDPOINT_ID" $AUTH
curl -s -X POST "$PORTAINER_URL/api/stacks/{stackId}/stop?endpointId=$PORTAINER_ENDPOINT_ID" $AUTH

# 删除 Stack
curl -s -X DELETE "$PORTAINER_URL/api/stacks/{stackId}?endpointId=$PORTAINER_ENDPOINT_ID" $AUTH

# Git 重部署（适用于 Git 来源的 Stack）
curl -s -X PUT "$PORTAINER_URL/api/stacks/{stackId}/git/redeploy?endpointId=$PORTAINER_ENDPOINT_ID" \
  $AUTH -H "Content-Type: application/json" \
  -d '{"PullImage": true, "RepositoryReferenceName": "refs/heads/main"}'
```

**Stack 类型说明：**
- `type=1`：Swarm Stack
- `type=2`：Compose Stack（独立 Docker 环境）

**Swarm Stack 注意事项：**
- 创建 Swarm Stack 需要提供 `SwarmID`，可通过 `GET $EP/docker/swarm` 获取
- 获取方式：`curl -s $EP/docker/swarm $AUTH | jq -r '.ID'`

### 模块 3：容器管理（P0）

```bash
# 列出所有容器（含已停止）
curl -s "$EP/docker/containers/json?all=true" $AUTH \
  | jq '.[] | {Id: .Id[:12], Names, State, Status, Image}'

# 启动 / 停止 / 重启容器
curl -s -X POST "$EP/docker/containers/{id}/start" $AUTH
curl -s -X POST "$EP/docker/containers/{id}/stop" $AUTH
curl -s -X POST "$EP/docker/containers/{id}/restart" $AUTH

# 查看容器日志（最后 100 行）
curl -s "$EP/docker/containers/{id}/logs?stdout=true&stderr=true&tail=100&timestamps=true" $AUTH

# 查看容器资源使用（非流式）
curl -s "$EP/docker/containers/{id}/stats?stream=false" $AUTH \
  | jq '{cpu_percent: ((.cpu_stats.cpu_usage.total_usage - .precpu_stats.cpu_usage.total_usage) / (.cpu_stats.system_cpu_usage - .precpu_stats.system_cpu_usage) * 100), memory_usage: (.memory_stats.usage / 1048576 | floor | tostring + "MB"), memory_limit: (.memory_stats.limit / 1048576 | floor | tostring + "MB")}'

# 查看容器详情
curl -s "$EP/docker/containers/{id}/json" $AUTH

# 删除容器
curl -s -X DELETE "$EP/docker/containers/{id}?force=true" $AUTH
```

### 模块 4：镜像管理（P1）

```bash
# 列出镜像
curl -s "$EP/docker/images/json" $AUTH \
  | jq '.[] | {Id: .Id[:19], RepoTags, Size: (.Size/1048576 | floor | tostring + "MB")}'

# 拉取镜像（返回流式 NDJSON，非标准 JSON）
curl -s -X POST "$EP/docker/images/create?fromImage=nginx&tag=1.27" $AUTH

# 删除镜像
curl -s -X DELETE "$EP/docker/images/{imageId}?force=true" $AUTH

# 清理未使用镜像
curl -s -X POST "$EP/docker/images/prune" $AUTH
```

### 模块 5：网络和卷（P1）

```bash
# 列出网络
curl -s "$EP/docker/networks" $AUTH | jq '.[] | {Id: .Id[:12], Name, Driver, Scope}'

# 创建网络
curl -s -X POST "$EP/docker/networks/create" $AUTH \
  -H "Content-Type: application/json" \
  -d '{"Name": "my-network", "Driver": "bridge"}'

# 删除网络
curl -s -X DELETE "$EP/docker/networks/{networkId}" $AUTH

# 列出卷
curl -s "$EP/docker/volumes" $AUTH | jq '.Volumes[] | {Name, Driver, Mountpoint}'

# 创建卷
curl -s -X POST "$EP/docker/volumes/create" $AUTH \
  -H "Content-Type: application/json" \
  -d '{"Name": "my-volume", "Driver": "local"}'

# 删除卷
curl -s -X DELETE "$EP/docker/volumes/{volumeName}" $AUTH
```

### 模块 6：Swarm 服务（P1）

```bash
# 列出 Swarm 服务
curl -s "$EP/docker/services" $AUTH \
  | jq '.[] | {ID: .ID[:12], Name: .Spec.Name, Image: .Spec.TaskTemplate.ContainerSpec.Image, Replicas: .Spec.Mode.Replicated.Replicas}'

# 获取服务详情
curl -s "$EP/docker/services/{serviceId}" $AUTH

# 更新服务（需要当前 version）
# 先获取 version: curl -s "$EP/docker/services/{serviceId}" $AUTH | jq '.Version.Index'
curl -s -X POST "$EP/docker/services/{serviceId}/update?version={versionIndex}" \
  $AUTH -H "Content-Type: application/json" -d '{...更新后的 Spec...}'

# 查看服务日志
curl -s "$EP/docker/services/{serviceId}/logs?stdout=true&stderr=true&tail=100" $AUTH

# 获取 Swarm 信息
curl -s "$EP/docker/swarm" $AUTH
```

### 模块 7：系统监控（P1）

```bash
# Docker 系统信息
curl -s "$EP/docker/info" $AUTH | jq '{Containers, ContainersRunning, ContainersStopped, Images, ServerVersion, MemTotal: (.MemTotal/1073741824 | floor | tostring + "GB")}'

# Docker 版本
curl -s "$EP/docker/version" $AUTH

# 磁盘使用统计
curl -s "$EP/docker/system/df" $AUTH \
  | jq '{Containers: (.Containers | length), Images: (.Images | length), Volumes: (.Volumes | length), TotalSize: ([.Images[].Size, .Containers[].SizeRw // 0] | add / 1073741824 * 100 | floor / 100 | tostring + "GB")}'

# 系统清理（谨慎使用，逐步清理）
curl -s -X POST "$EP/docker/containers/prune" $AUTH   # 清理已停止容器
curl -s -X POST "$EP/docker/images/prune" $AUTH        # 清理悬挂镜像
curl -s -X POST "$EP/docker/volumes/prune" $AUTH       # 清理未使用卷
curl -s -X POST "$EP/docker/networks/prune" $AUTH      # 清理未使用网络
```

### 模块 8：Webhook 管理（P0）

```bash
# Webhook 信息包含在 Stack 对象中
curl -s $PORTAINER_URL/api/stacks $AUTH | jq '.[] | select(.Webhook != "") | {Id, Name, Webhook}'

# 触发 Webhook 重部署（公开端点，无需认证）
curl -s -X POST "$PORTAINER_URL/api/stacks/webhooks/{webhookID}"

# 在创建/更新 Stack 时启用 Webhook
# 在 body 中添加 "Webhook": "自定义-webhook-id" 或留空让系统生成
```

## 通用错误处理

| 状态码 | 含义 | 应对 |
|--------|------|------|
| 401 | 未认证 | 检查 `PORTAINER_API_KEY` 是否有效，或 JWT Token 是否过期 |
| 403 | 无权限 | 当前用户无操作权限，联系管理员 |
| 404 | 不存在 | 区分：资源不存在 vs API 端点不存在（版本兼容问题） |
| 409 | 冲突 | 资源名称重复或状态冲突，提示具体冲突原因 |
| 500 | 服务器错误 | 检查 Portainer 日志：`docker logs <portainer-container>` |
| 连接超时 | 网络不通 | 检查 `PORTAINER_URL` 是否可达，防火墙/代理设置 |

**通用重试策略：** 网络错误最多重试 2 次，间隔 3 秒。认证失败不重试，直接提示。

## 安全规范

1. **API Key 脱敏**：日志和输出中只显示 `ptr_xxxx...`（前 8 位 + `...`）
2. **危险操作确认**：执行删除（Stack/容器/镜像/卷/网络）前列出受影响资源，等待用户确认
3. **敏感值掩码**：环境变量中含 `PASSWORD`、`SECRET`、`KEY`、`TOKEN` 的值用 `***` 替代显示
4. **不硬编码凭据**：所有认证信息从环境变量或配置发现流程获取
5. **最小权限原则**：优先使用只读操作，写操作前确认意图

## 参考文档

如需更详细的信息，请读取以下参考文件：
- 完整 API 端点列表 → `references/api-reference.md`
- Docker 代理 API 详情 → `references/docker-proxy-api.md`
- 工作流示例和最佳实践 → `references/workflow-examples.md`
- 验收测试清单 → `references/acceptance-checklist.md`
