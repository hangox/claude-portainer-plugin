# 工作流示例与最佳实践

> 本文档提供 Portainer Skill 的典型操作工作流，包含完整的 curl 命令序列和决策逻辑。

## 目录

1. [Stack 完整部署工作流](#1-stack-完整部署工作流)
2. [Stack 更新工作流](#2-stack-更新工作流)
3. [容器日志排查工作流](#3-容器日志排查工作流)
4. [批量镜像清理工作流](#4-批量镜像清理工作流)
5. [CI/CD Webhook 集成工作流](#5-cicd-webhook-集成工作流)
6. [多环境管理工作流](#6-多环境管理工作流)
7. [最佳实践](#7-最佳实践)

---

**变量约定：**
- `$PORTAINER_URL` — Portainer 地址（如 `https://portainer.example.com`）
- `$AUTH` — 认证头（`-H "X-API-Key: $PORTAINER_API_KEY"` 或 `-H "Authorization: Bearer $TOKEN"`）
- `$PORTAINER_ENDPOINT_ID` — 目标环境 ID
- `$EP` — Docker 代理前缀，即 `$PORTAINER_URL/api/endpoints/$PORTAINER_ENDPOINT_ID`

---

## 1. Stack 完整部署工作流

**场景：** 用户说"把这个 docker-compose.yml 部署到 Portainer"

### 步骤总览

```
1. 配置检查 → 确保有 PORTAINER_URL / API Key / Endpoint ID
2. 读取本地 docker-compose.yml 文件内容
3. 生成 Stack 名称（从文件名或目录名推断，或询问用户）
4. 创建 Stack
5. 检查响应，处理错误
6. 验证部署结果
```

### 详细步骤

**步骤 1：验证配置和连通性**

```bash
# 检查 Portainer 是否可达，同时验证认证
curl -s -o /dev/null -w "%{http_code}" \
  $AUTH "$PORTAINER_URL/api/system/status"
# 期望: 200
# 401 → API Key 无效
# 000/超时 → URL 不可达
```

**步骤 2：读取 docker-compose.yml**

```bash
# 读取文件内容（在 Claude Code 中通过 Read 工具完成）
# 文件内容将作为 StackFileContent 的值传入
cat docker-compose.yml
```

**步骤 3：确定 Stack 类型**

```bash
# 检查目标环境是否为 Swarm 模式
SWARM_ID=$(curl -s $AUTH "$EP/docker/swarm" | jq -r '.ID // empty')

# 如果 SWARM_ID 非空 → Swarm 环境，使用 type=1
# 如果 SWARM_ID 为空 → 独立 Docker 环境，使用 type=2
```

**步骤 4a：创建 Compose Stack（独立 Docker 环境）**

```bash
curl -s -X POST $AUTH \
  -H "Content-Type: application/json" \
  -d '{
    "Name": "my-stack",
    "StackFileContent": "<docker-compose.yml 内容，JSON 转义>",
    "Env": [
      {"name": "DB_PASSWORD", "value": "secret123"}
    ]
  }' \
  "$PORTAINER_URL/api/stacks/create/2/string?endpointId=$PORTAINER_ENDPOINT_ID"
```

**步骤 4b：创建 Swarm Stack（Swarm 环境）**

```bash
curl -s -X POST $AUTH \
  -H "Content-Type: application/json" \
  -d '{
    "Name": "my-stack",
    "StackFileContent": "<docker-compose.yml 内容，JSON 转义>",
    "SwarmID": "'$SWARM_ID'",
    "Env": []
  }' \
  "$PORTAINER_URL/api/stacks/create/1/string?endpointId=$PORTAINER_ENDPOINT_ID"
```

**步骤 5：处理响应**

```bash
# 成功响应示例 (HTTP 200):
# {"Id":42,"Name":"my-stack","Type":2,"EndpointId":2,"Status":1,...}

# 错误处理:
# HTTP 409 → 名称已存在
#   选项1: 询问用户是否更新已有 Stack
#   选项2: 建议使用其他名称
# HTTP 400 → compose 文件格式错误
#   解析 response.message 中的具体错误
# HTTP 401 → 认证失败
#   提示检查 API Key
```

**步骤 6：验证部署**

```bash
# 获取新创建的 Stack 详情
STACK_ID=42  # 从步骤 5 响应中获取
curl -s $AUTH "$PORTAINER_URL/api/stacks/$STACK_ID" \
  | jq '{Id, Name, Status, CreationDate}'

# 检查关联容器状态
curl -s $AUTH "$EP/docker/containers/json?all=true" \
  | jq '.[] | select(.Labels["com.docker.compose.project"] == "my-stack") | {Id: .Id[:12], Names, State, Status}'
```

---

## 2. Stack 更新工作流

**场景：** 用户修改了 docker-compose.yml，说"更新 my-stack"

### 步骤总览

```
1. 查找目标 Stack → 获取 Stack ID
2. 备份当前编排文件
3. 读取新的 compose 文件内容
4. 更新 Stack
5. 验证更新结果
```

### 详细步骤

**步骤 1：查找目标 Stack**

```bash
# 列出所有 Stack，找到目标
curl -s $AUTH "$PORTAINER_URL/api/stacks" \
  | jq '.[] | select(.Name == "my-stack") | {Id, Name, Status, Type}'

# 如果找到多个同名（不同环境），按 EndpointId 过滤
curl -s $AUTH "$PORTAINER_URL/api/stacks" \
  | jq '.[] | select(.Name == "my-stack" and .EndpointId == '$PORTAINER_ENDPOINT_ID') | .Id'
```

**步骤 2：备份当前编排文件**

```bash
STACK_ID=42
# 获取当前 compose 文件内容，用于出问题时回滚
curl -s $AUTH "$PORTAINER_URL/api/stacks/$STACK_ID/file" \
  | jq -r '.StackFileContent'
```

**步骤 3：读取新的 compose 文件并更新**

```bash
# 更新 Stack
curl -s -X PUT $AUTH \
  -H "Content-Type: application/json" \
  -d '{
    "StackFileContent": "<新的 docker-compose.yml 内容>",
    "Env": [],
    "Prune": false,
    "PullImage": true
  }' \
  "$PORTAINER_URL/api/stacks/$STACK_ID?endpointId=$PORTAINER_ENDPOINT_ID"
```

> **Prune 参数说明：**
> - `false`（默认）：保留旧的不再定义的服务容器
> - `true`：移除编排文件中不再定义的服务

**步骤 4：验证更新**

```bash
# 检查 Stack 状态
curl -s $AUTH "$PORTAINER_URL/api/stacks/$STACK_ID" \
  | jq '{Id, Name, Status, UpdateDate}'

# 检查容器是否正常运行
curl -s $AUTH "$EP/docker/containers/json?all=true" \
  | jq '.[] | select(.Labels["com.docker.compose.project"] == "my-stack") | {Names, State, Status, Image}'
```

---

## 3. 容器日志排查工作流

**场景：** 用户说"看看 redis 容器出了什么问题"

### 步骤总览

```
1. 搜索容器（模糊匹配名称）
2. 检查容器状态和基本信息
3. 获取最近日志
4. 获取资源统计（如运行中）
5. 汇总分析并给出建议
```

### 详细步骤

**步骤 1：搜索容器**

```bash
# 列出所有容器（含已停止），按名称过滤
curl -s $AUTH "$EP/docker/containers/json?all=true" \
  | jq '.[] | select(.Names[] | test("redis"; "i")) | {Id: .Id[:12], Names, State, Status, Image}'

# 输出示例:
# {"Id":"a1b2c3d4e5f6","Names":["/redis"],"State":"running","Status":"Up 3 days","Image":"redis:7.4"}
# {"Id":"f6e5d4c3b2a1","Names":["/redis-backup"],"State":"exited","Status":"Exited (1) 2 hours ago","Image":"redis:7.4"}
```

**步骤 2：检查容器详情**

```bash
CONTAINER_ID="a1b2c3d4e5f6"

# 获取容器详细信息
curl -s $AUTH "$EP/docker/containers/$CONTAINER_ID/json" \
  | jq '{
    Name,
    State: {Status: .State.Status, Running: .State.Running, ExitCode: .State.ExitCode, StartedAt: .State.StartedAt, FinishedAt: .State.FinishedAt, OOMKilled: .State.OOMKilled},
    Image: .Config.Image,
    RestartCount: .RestartCount,
    RestartPolicy: .HostConfig.RestartPolicy
  }'
```

**步骤 3：获取最近日志**

```bash
# 获取最后 200 行日志（含时间戳）
curl -s $AUTH \
  "$EP/docker/containers/$CONTAINER_ID/logs?stdout=true&stderr=true&tail=200&timestamps=true"

# 仅获取错误日志（stderr）
curl -s $AUTH \
  "$EP/docker/containers/$CONTAINER_ID/logs?stdout=false&stderr=true&tail=100&timestamps=true"

# 获取指定时间范围的日志（Unix 时间戳）
curl -s $AUTH \
  "$EP/docker/containers/$CONTAINER_ID/logs?stdout=true&stderr=true&since=1700000000&until=1700086400"
```

**步骤 4：获取资源统计**

```bash
# 获取资源使用情况（仅在容器运行中时有效）
curl -s $AUTH "$EP/docker/containers/$CONTAINER_ID/stats?stream=false" \
  | jq '{
    cpu_percent: ((.cpu_stats.cpu_usage.total_usage - .precpu_stats.cpu_usage.total_usage) / (.cpu_stats.system_cpu_usage - .precpu_stats.system_cpu_usage) * 100),
    memory_usage: (.memory_stats.usage / 1048576 | floor | tostring + "MB"),
    memory_limit: (.memory_stats.limit / 1048576 | floor | tostring + "MB"),
    memory_percent: (.memory_stats.usage / .memory_stats.limit * 100 | floor),
    network_rx: (.networks.eth0.rx_bytes // 0 / 1048576 | floor | tostring + "MB"),
    network_tx: (.networks.eth0.tx_bytes // 0 / 1048576 | floor | tostring + "MB")
  }'
```

**步骤 5：汇总分析**

根据以上信息综合判断：

| 症状 | 可能原因 | 建议操作 |
|------|----------|----------|
| State=exited, ExitCode=137 | OOM 被杀 | 增加内存限制或优化内存使用 |
| State=exited, ExitCode=1 | 应用错误 | 检查日志中的错误信息 |
| State=restarting, RestartCount>5 | 反复崩溃 | 检查日志，可能是配置错误 |
| cpu_percent>90 | CPU 占用过高 | 检查负载来源，考虑扩容 |
| memory_percent>90 | 内存接近上限 | 调整 memory_limit 或优化 |
| OOMKilled=true | 内存溢出 | 增加内存限制 |

---

## 4. 批量镜像清理工作流

**场景：** 用户说"清理一下没用的镜像，磁盘快满了"

### 步骤总览

```
1. 查看磁盘使用概况
2. 列出 dangling 镜像（无标签的旧镜像）
3. 展示清理计划，等待用户确认
4. 执行清理
5. 展示清理结果
```

### 详细步骤

**步骤 1：查看磁盘使用**

```bash
# 获取 Docker 磁盘使用统计
curl -s $AUTH "$EP/docker/system/df" \
  | jq '{
    Images: {
      Count: (.Images | length),
      Active: ([.Images[] | select(.Containers > 0)] | length),
      TotalSize: ([.Images[].Size] | add / 1073741824 * 100 | floor / 100 | tostring + " GB"),
      ReclaimableSize: ([.Images[] | select(.Containers == 0) | .Size] | add // 0 / 1073741824 * 100 | floor / 100 | tostring + " GB")
    },
    Containers: {
      Count: (.Containers | length),
      Running: ([.Containers[] | select(.State == "running")] | length),
      Stopped: ([.Containers[] | select(.State != "running")] | length)
    },
    Volumes: {
      Count: (.Volumes | length),
      TotalSize: ([.Volumes[].UsageData.Size] | add // 0 / 1073741824 * 100 | floor / 100 | tostring + " GB")
    }
  }'
```

**步骤 2：列出可清理的镜像**

```bash
# 列出 dangling 镜像（无标签）
curl -s $AUTH "$EP/docker/images/json?filters=%7B%22dangling%22%3A%5B%22true%22%5D%7D" \
  | jq '.[] | {Id: .Id[:19], Created: (.Created | todate), Size: (.Size / 1048576 | floor | tostring + " MB")}'

# 列出所有未被容器使用的镜像
curl -s $AUTH "$EP/docker/images/json" \
  | jq '[.[] | select(.Containers == 0 or .Containers == null)] | .[] | {Id: .Id[:19], RepoTags, Size: (.Size / 1048576 | floor | tostring + " MB")}'
```

**步骤 3：展示清理计划**

此时向用户展示将要清理的镜像列表和预计释放的空间，等待确认。

**步骤 4：执行清理**

```bash
# 方案 A：仅清理 dangling 镜像（安全）
curl -s -X POST $AUTH \
  "$EP/docker/images/prune?filters=%7B%22dangling%22%3A%5B%22true%22%5D%7D"

# 方案 B：清理所有未使用镜像（更激进，需二次确认）
curl -s -X POST $AUTH \
  "$EP/docker/images/prune"

# 可选：同时清理已停止的容器
curl -s -X POST $AUTH "$EP/docker/containers/prune"

# 可选：清理未使用的网络
curl -s -X POST $AUTH "$EP/docker/networks/prune"
```

**步骤 5：展示结果**

```bash
# prune 响应示例:
# {
#   "ImagesDeleted": [
#     {"Untagged": "nginx@sha256:abc..."},
#     {"Deleted": "sha256:123..."}
#   ],
#   "SpaceReclaimed": 1073741824
# }

# 将 SpaceReclaimed 转换为可读格式
# 1073741824 bytes = 1 GB
```

---

## 5. CI/CD Webhook 集成工作流

**场景：** 用户说"给 my-stack 配置 webhook，CI 构建完自动重部署"

### 步骤总览

```
1. 获取 Stack 详情，检查是否已有 Webhook
2. 如无，创建 Webhook
3. 获取 Webhook URL
4. 提供 CI/CD 集成示例
```

### 详细步骤

**步骤 1：查找 Stack 并检查 Webhook**

```bash
# 获取 Stack 列表，查找目标 Stack
curl -s $AUTH "$PORTAINER_URL/api/stacks" \
  | jq '.[] | select(.Name == "my-stack") | {Id, Name, AutoUpdate}'

# 检查已有的 Webhook
curl -s $AUTH "$PORTAINER_URL/api/webhooks" \
  | jq '.[] | select(.ResourceID == "my-stack-id") | {Id, Token, WebhookType}'
```

**步骤 2：创建 Webhook**

```bash
# 为 Stack 创建 Webhook
# WebhookType: 1 = 服务 Webhook, 2 = Stack Webhook
curl -s -X POST $AUTH \
  -H "Content-Type: application/json" \
  -d '{
    "ResourceID": "stack-id-or-service-id",
    "EndpointID": '$PORTAINER_ENDPOINT_ID',
    "WebhookType": 1,
    "RegistryID": 0
  }' \
  "$PORTAINER_URL/api/webhooks"

# 响应中包含 Token，用于构造 Webhook URL
# {"Id":1,"Token":"c50cddad-77c5-4fde-9f68-a390a5c8a2e3",...}
```

**步骤 3：构造 Webhook URL**

```
Webhook URL 格式:
$PORTAINER_URL/api/stacks/webhooks/{Token}

示例:
https://portainer.example.com/api/stacks/webhooks/c50cddad-77c5-4fde-9f68-a390a5c8a2e3
```

**步骤 4：CI/CD 集成示例**

GitHub Actions:

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    tags: ['v*']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Build and push image
        run: |
          docker build -t my-image:${{ github.ref_name }} .
          docker push my-image:${{ github.ref_name }}

      - name: Trigger Portainer redeploy
        run: |
          curl -s -X POST "${{ secrets.PORTAINER_WEBHOOK_URL }}"
```

GitLab CI:

```yaml
# .gitlab-ci.yml
deploy:
  stage: deploy
  script:
    - curl -s -X POST "$PORTAINER_WEBHOOK_URL"
  only:
    - tags
```

Jenkins (Pipeline):

```groovy
// Jenkinsfile
pipeline {
    agent any
    stages {
        stage('Deploy') {
            steps {
                sh 'curl -s -X POST "${PORTAINER_WEBHOOK_URL}"'
            }
        }
    }
}
```

通用 Shell:

```bash
# 触发重部署（公开端点，无需认证）
curl -s -X POST "$PORTAINER_URL/api/stacks/webhooks/c50cddad-77c5-4fde-9f68-a390a5c8a2e3"
```

> **安全提示：** Webhook URL 是公开的，无需认证即可触发。请将 URL 作为 Secret 存储在 CI/CD 平台中，不要硬编码在仓库代码里。

---

## 6. 多环境管理工作流

**场景：** 用户说"把这个服务部署到生产环境"

### 步骤总览

```
1. 列出所有可用环境
2. 展示环境列表供选择
3. 使用选定的 Endpoint ID 执行部署
4. （可选）跨环境对比
```

### 详细步骤

**步骤 1：列出所有环境**

```bash
curl -s $AUTH "$PORTAINER_URL/api/endpoints" \
  | jq '.[] | {
    Id,
    Name,
    Type: (if .Type == 1 then "Docker 本地"
           elif .Type == 2 then "Docker Agent"
           elif .Type == 4 then "Edge Agent"
           elif .Type == 5 then "Azure ACI"
           else "其他(\(.Type))" end),
    Status: (if .Status == 1 then "运行中" elif .Status == 2 then "离线" else "未知" end),
    URL
  }'
```

**步骤 2：用户选择环境后部署**

```bash
# 假设用户选择了 Endpoint ID = 3 (生产环境)
TARGET_ENDPOINT=3

# 使用目标环境 ID 创建 Stack
curl -s -X POST $AUTH \
  -H "Content-Type: application/json" \
  -d '{
    "Name": "my-service",
    "StackFileContent": "<compose 内容>",
    "Env": []
  }' \
  "$PORTAINER_URL/api/stacks/create/2/string?endpointId=$TARGET_ENDPOINT"
```

**步骤 3：跨环境对比**

```bash
# 列出两个环境中同名 Stack 的差异
# 环境 A (开发)
DEV_COMPOSE=$(curl -s $AUTH "$PORTAINER_URL/api/stacks" \
  | jq -r '.[] | select(.Name == "my-service" and .EndpointId == 2) | .Id' \
  | xargs -I {} curl -s $AUTH "$PORTAINER_URL/api/stacks/{}/file" \
  | jq -r '.StackFileContent')

# 环境 B (生产)
PROD_COMPOSE=$(curl -s $AUTH "$PORTAINER_URL/api/stacks" \
  | jq -r '.[] | select(.Name == "my-service" and .EndpointId == 3) | .Id' \
  | xargs -I {} curl -s $AUTH "$PORTAINER_URL/api/stacks/{}/file" \
  | jq -r '.StackFileContent')

# 对比差异
diff <(echo "$DEV_COMPOSE") <(echo "$PROD_COMPOSE")
```

---

## 7. 最佳实践

### 命名规范

- **Stack 名称**：使用小写字母 + 连字符，与 docker-compose 项目名保持一致
  - 正确：`my-service`、`nginx-proxy`、`redis-cache`
  - 错误：`MyService`、`nginx_proxy`、`REDIS`
- **环境变量**：全大写 + 下划线，如 `DB_PASSWORD`、`API_KEY`

### 环境变量管理

- 敏感值（密码、Token）通过 Portainer 环境变量管理，不硬编码在 compose 文件中
- 在 Portainer UI 中设置的环境变量不会出现在 compose 文件的版本控制中
- 通过 API 设置环境变量：

```bash
curl -s -X PUT $AUTH \
  -H "Content-Type: application/json" \
  -d '{
    "StackFileContent": "<compose 内容>",
    "Env": [
      {"name": "DB_PASSWORD", "value": "new-secure-password"},
      {"name": "API_KEY", "value": "ptr_xxxx"}
    ],
    "Prune": false
  }' \
  "$PORTAINER_URL/api/stacks/$STACK_ID?endpointId=$PORTAINER_ENDPOINT_ID"
```

### 备份策略

- 重大更新前先备份当前编排文件：

```bash
# 备份 Stack 编排文件
STACK_ID=42
curl -s $AUTH "$PORTAINER_URL/api/stacks/$STACK_ID/file" \
  | jq -r '.StackFileContent' > "backup-my-stack-$(date +%Y%m%d%H%M%S).yml"
```

- 定期备份 Portainer 数据库：

```bash
# 创建 Portainer 完整备份
curl -s -X POST $AUTH \
  -H "Content-Type: application/json" \
  -d '{"password":"backup-encryption-key"}' \
  -o "portainer-backup-$(date +%Y%m%d).tar.gz" \
  "$PORTAINER_URL/api/backup"
```

### 回滚方案

保留上一版本的 compose 内容，出问题时 PUT 回去：

```bash
# 回滚到备份的 compose 文件
BACKUP_CONTENT=$(cat backup-my-stack-20240101120000.yml)

curl -s -X PUT $AUTH \
  -H "Content-Type: application/json" \
  -d '{
    "StackFileContent": "'"$(echo "$BACKUP_CONTENT" | jq -Rs .)"'",
    "Env": [],
    "Prune": false
  }' \
  "$PORTAINER_URL/api/stacks/$STACK_ID?endpointId=$PORTAINER_ENDPOINT_ID"
```

### 资源清理

定期执行清理，保持系统健康：

```bash
# 推荐的清理顺序（从安全到激进）：
# 1. 清理 dangling 镜像（最安全）
curl -s -X POST $AUTH "$EP/docker/images/prune?filters=%7B%22dangling%22%3A%5B%22true%22%5D%7D"

# 2. 清理已停止的容器
curl -s -X POST $AUTH "$EP/docker/containers/prune"

# 3. 清理未使用的网络
curl -s -X POST $AUTH "$EP/docker/networks/prune"

# 4. 清理未使用的卷（谨慎！可能丢失数据）
# curl -s -X POST $AUTH "$EP/docker/volumes/prune"
```

### 部署前检查清单

1. compose 文件语法是否正确（`docker compose config` 验证）
2. 镜像版本是否固定（不使用 `latest`）
3. 网络配置是否正确（是否加入了必要的外部网络）
4. 端口是否冲突（检查目标环境已占用的端口）
5. 卷挂载路径在目标主机上是否存在
6. 环境变量是否齐全
7. 资源限制是否合理（`deploy.resources.limits`）
