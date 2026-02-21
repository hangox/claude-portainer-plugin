# Docker Engine 代理 API 参考

> Portainer 通过代理路径透传 Docker Engine API，支持所有 Docker API 操作。

## 概览

- **代理路径格式**: `$PORTAINER_URL/api/endpoints/$PORTAINER_ENDPOINT_ID/docker/{docker_api_path}`
- **简写**: `$DOCKER_API` = `$PORTAINER_URL/api/endpoints/$PORTAINER_ENDPOINT_ID/docker`
- **认证**: 与 Portainer API 相同（`X-API-Key` 或 `Authorization: Bearer`）
- **内容类型**: `application/json`
- **变量约定**:
  - `$PORTAINER_URL` — Portainer 地址
  - `$AUTH` — 认证头
  - `$PORTAINER_ENDPOINT_ID` — 目标环境 ID
  - `$DOCKER_API` — Docker 代理基础路径

---

## 容器操作

| 方法 | 路径 | 说明 | 常用参数 |
|------|------|------|----------|
| GET | /containers/json | 列出容器 | `all=true`, `filters={"name":["xxx"]}` |
| GET | /containers/{id}/json | 容器详情 | — |
| POST | /containers/{id}/start | 启动容器 | — |
| POST | /containers/{id}/stop | 停止容器 | `t=10`（超时秒数） |
| POST | /containers/{id}/restart | 重启容器 | `t=10` |
| POST | /containers/{id}/kill | 强制终止 | `signal=SIGKILL` |
| DELETE | /containers/{id} | 删除容器 | `force=true`, `v=true`（删关联卷） |
| GET | /containers/{id}/logs | 获取日志 | `stdout=true`, `stderr=true`, `tail=100`, `since=timestamp` |
| GET | /containers/{id}/stats | 资源统计 | `stream=false`（单次快照） |
| POST | /containers/{id}/exec | 创建 exec | Body: `{"Cmd":["sh"],"AttachStdin":true,...}` |
| GET | /containers/{id}/top | 进程列表 | — |

```bash
# 列出所有运行中的容器
curl -s $AUTH "$DOCKER_API/containers/json" | jq '.[] | {Id: .Id[:12], Name: .Names[0], Image, State, Status}'

# 列出所有容器（包括已停止）
curl -s $AUTH "$DOCKER_API/containers/json?all=true" | jq '.[] | {Id: .Id[:12], Name: .Names[0], State}'

# 按名称过滤容器
curl -s $AUTH "$DOCKER_API/containers/json?filters=%7B%22name%22%3A%5B%22nginx%22%5D%7D" \
  | jq '.[] | {Id: .Id[:12], Name: .Names[0]}'

# 获取容器详情
curl -s $AUTH "$DOCKER_API/containers/my-container/json" | jq '{Id, Name, State, Config: {Image: .Config.Image}}'

# 查看容器最近 50 行日志
curl -s $AUTH "$DOCKER_API/containers/my-container/logs?stdout=true&stderr=true&tail=50"

# 停止容器（10 秒超时）
curl -s -X POST $AUTH "$DOCKER_API/containers/my-container/stop?t=10"

# 重启容器
curl -s -X POST $AUTH "$DOCKER_API/containers/my-container/restart?t=10"

# 删除容器（强制 + 删除关联卷）
curl -s -X DELETE $AUTH "$DOCKER_API/containers/my-container?force=true&v=true"

# 获取容器资源统计（单次快照）
curl -s $AUTH "$DOCKER_API/containers/my-container/stats?stream=false" \
  | jq '{cpu_percent: (.cpu_stats.cpu_usage.total_usage / .cpu_stats.system_cpu_usage * 100), memory_usage: .memory_stats.usage}'
```

---

## 镜像操作

| 方法 | 路径 | 说明 | 常用参数 |
|------|------|------|----------|
| GET | /images/json | 列出镜像 | `all=true` |
| POST | /images/create | 拉取镜像 | `fromImage=nginx&tag=1.27` |
| DELETE | /images/{id} | 删除镜像 | `force=true` |
| POST | /images/prune | 清理未使用镜像 | `filters={"dangling":["true"]}` |
| GET | /images/{id}/json | 镜像详情 | — |

```bash
# 列出所有镜像
curl -s $AUTH "$DOCKER_API/images/json" | jq '.[] | {Id: .Id[:19], RepoTags, Size}'

# 拉取镜像
curl -s -X POST $AUTH "$DOCKER_API/images/create?fromImage=nginx&tag=1.27"

# 删除镜像
curl -s -X DELETE $AUTH "$DOCKER_API/images/nginx:1.27?force=true"

# 清理悬空镜像
curl -s -X POST $AUTH "$DOCKER_API/images/prune?filters=%7B%22dangling%22%3A%5B%22true%22%5D%7D" \
  | jq '{ImagesDeleted, SpaceReclaimed}'
```

---

## 网络操作

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /networks | 列出网络 |
| GET | /networks/{id} | 网络详情 |
| POST | /networks/create | 创建网络 |
| DELETE | /networks/{id} | 删除网络 |
| POST | /networks/{id}/connect | 连接容器到网络 |
| POST | /networks/{id}/disconnect | 断开容器与网络 |
| POST | /networks/prune | 清理未使用网络 |

```bash
# 列出所有网络
curl -s $AUTH "$DOCKER_API/networks" | jq '.[] | {Id: .Id[:12], Name, Driver, Scope}'

# 创建 overlay 网络
curl -s -X POST $AUTH \
  -H "Content-Type: application/json" \
  -d '{"Name":"my-network","Driver":"overlay","Attachable":true}' \
  "$DOCKER_API/networks/create"

# 连接容器到网络
curl -s -X POST $AUTH \
  -H "Content-Type: application/json" \
  -d '{"Container":"container-id"}' \
  "$DOCKER_API/networks/my-network/connect"

# 断开容器与网络
curl -s -X POST $AUTH \
  -H "Content-Type: application/json" \
  -d '{"Container":"container-id","Force":true}' \
  "$DOCKER_API/networks/my-network/disconnect"
```

---

## 卷操作

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /volumes | 列出卷 |
| GET | /volumes/{name} | 卷详情 |
| POST | /volumes/create | 创建卷 |
| DELETE | /volumes/{name} | 删除卷 |
| POST | /volumes/prune | 清理未使用卷 |

```bash
# 列出所有卷
curl -s $AUTH "$DOCKER_API/volumes" | jq '.Volumes[] | {Name, Driver, Mountpoint}'

# 创建卷
curl -s -X POST $AUTH \
  -H "Content-Type: application/json" \
  -d '{"Name":"my-data","Driver":"local"}' \
  "$DOCKER_API/volumes/create"

# 删除卷
curl -s -X DELETE $AUTH "$DOCKER_API/volumes/my-data"

# 清理未使用卷
curl -s -X POST $AUTH "$DOCKER_API/volumes/prune" | jq '{VolumesDeleted, SpaceReclaimed}'
```

---

## Swarm 服务操作

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /services | 列出服务 |
| GET | /services/{id} | 服务详情 |
| POST | /services/create | 创建服务 |
| POST | /services/{id}/update | 更新服务 |
| DELETE | /services/{id} | 删除服务 |
| GET | /services/{id}/logs | 服务日志 |
| GET | /tasks | 列出任务 |

**强制更新（重新拉取镜像）**: `POST /services/{id}/update?version={version}` + `X-Registry-Auth` header + `Spec.TaskTemplate.ForceUpdate` 递增。

```bash
# 列出所有服务
curl -s $AUTH "$DOCKER_API/services" \
  | jq '.[] | {ID: .ID[:12], Name: .Spec.Name, Image: .Spec.TaskTemplate.ContainerSpec.Image, Replicas: .Spec.Mode.Replicated.Replicas}'

# 获取服务详情
curl -s $AUTH "$DOCKER_API/services/my-service" | jq '{ID, Spec: {Name: .Spec.Name, Image: .Spec.TaskTemplate.ContainerSpec.Image}}'

# 查看服务日志（最近 100 行）
curl -s $AUTH "$DOCKER_API/services/my-service/logs?stdout=true&stderr=true&tail=100"

# 强制更新服务（拉取最新镜像）
# 先获取当前版本号和 ForceUpdate 值
VERSION=$(curl -s $AUTH "$DOCKER_API/services/my-service" | jq '.Version.Index')
SPEC=$(curl -s $AUTH "$DOCKER_API/services/my-service" | jq '.Spec | .TaskTemplate.ForceUpdate += 1')
curl -s -X POST $AUTH \
  -H "Content-Type: application/json" \
  -H "X-Registry-Auth: $(echo '{}' | base64)" \
  -d "$SPEC" \
  "$DOCKER_API/services/my-service/update?version=$VERSION"

# 列出服务的任务（查看副本状态）
curl -s $AUTH "$DOCKER_API/tasks?filters=%7B%22service%22%3A%5B%22my-service%22%5D%7D" \
  | jq '.[] | {ID: .ID[:12], Status: .Status.State, DesiredState, NodeID: .NodeID[:12]}'
```

---

## 系统操作

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /info | Docker 系统信息 |
| GET | /version | Docker 版本 |
| GET | /system/df | 磁盘使用情况 |
| POST | /containers/prune | 清理停止的容器 |
| POST | /images/prune | 清理未使用镜像 |
| POST | /volumes/prune | 清理未使用卷 |
| POST | /networks/prune | 清理未使用网络 |

```bash
# Docker 系统信息
curl -s $AUTH "$DOCKER_API/info" | jq '{ServerVersion, OperatingSystem, NCPU, MemTotal, Containers, Images}'

# Docker 版本
curl -s $AUTH "$DOCKER_API/version" | jq '{Version, ApiVersion, Os, Arch}'

# 磁盘使用情况
curl -s $AUTH "$DOCKER_API/system/df" | jq '{
  Containers: (.Containers | length),
  Images: (.Images | length),
  Volumes: (.Volumes | length),
  BuildCacheSize: .BuildCache | map(.Size) | add
}'

# 清理停止的容器
curl -s -X POST $AUTH "$DOCKER_API/containers/prune" | jq '{ContainersDeleted, SpaceReclaimed}'
```

---

## 过滤器语法

Docker API 的 `filters` 参数使用 JSON 格式，传入时需 URL 编码。

**格式**: `filters={"key":["value1","value2"]}`

**常用过滤器**:

| 过滤器 | 适用资源 | 示例 |
|--------|----------|------|
| `name` | 容器、网络、卷 | `{"name":["nginx"]}` |
| `status` | 容器 | `{"status":["running"]}` |
| `label` | 容器、镜像、网络、卷 | `{"label":["com.docker.compose.project=myapp"]}` |
| `id` | 容器、镜像 | `{"id":["abc123"]}` |
| `dangling` | 镜像、卷 | `{"dangling":["true"]}` |
| `network` | 容器 | `{"network":["my-network"]}` |
| `volume` | 容器 | `{"volume":["my-volume"]}` |
| `ancestor` | 容器 | `{"ancestor":["nginx:1.27"]}` |
| `service` | 任务 | `{"service":["my-service"]}` |

**多条件组合**: 同一 key 多个值为 OR，不同 key 之间为 AND。

```bash
# 按名称过滤容器
curl -s $AUTH "$DOCKER_API/containers/json?filters=%7B%22name%22%3A%5B%22nginx%22%5D%7D"

# 按状态过滤容器
curl -s $AUTH "$DOCKER_API/containers/json?filters=%7B%22status%22%3A%5B%22running%22%5D%7D"

# 按标签过滤容器
curl -s $AUTH "$DOCKER_API/containers/json?filters=%7B%22label%22%3A%5B%22com.docker.compose.project%3Dmyapp%22%5D%7D"

# 多条件组合：运行中 + 名称包含 nginx
curl -s $AUTH "$DOCKER_API/containers/json?filters=%7B%22status%22%3A%5B%22running%22%5D%2C%22name%22%3A%5B%22nginx%22%5D%7D"
```

---

## Agent 特殊头部

当环境类型为 Docker Agent（Type=2）时，可使用以下额外头部：

| 头部 | 说明 | 示例 |
|------|------|------|
| `X-PortainerAgent-Target` | 指定目标节点名称 | `node-01` |

在 Swarm 集群中，Agent 默认将请求发送到 manager 节点。通过此头部可将请求路由到指定 worker 节点，常用于获取特定节点上的容器日志或执行节点级操作。

```bash
# 获取指定节点上的容器列表
curl -s $AUTH \
  -H "X-PortainerAgent-Target: worker-01" \
  "$DOCKER_API/containers/json" | jq '.[] | {Id: .Id[:12], Name: .Names[0]}'

# 获取指定节点上的系统信息
curl -s $AUTH \
  -H "X-PortainerAgent-Target: worker-01" \
  "$DOCKER_API/info" | jq '{Name, NCPU, MemTotal}'
```

---

## 常见操作模式

### 完整的容器生命周期

```bash
# 1. 拉取镜像
curl -s -X POST $AUTH "$DOCKER_API/images/create?fromImage=nginx&tag=1.27"

# 2. 创建容器
curl -s -X POST $AUTH \
  -H "Content-Type: application/json" \
  -d '{
    "Image": "nginx:1.27",
    "HostConfig": {
      "PortBindings": {"80/tcp": [{"HostPort": "8080"}]},
      "RestartPolicy": {"Name": "unless-stopped"}
    }
  }' \
  "$DOCKER_API/containers/create?name=my-nginx" | jq '.Id'

# 3. 启动容器
curl -s -X POST $AUTH "$DOCKER_API/containers/my-nginx/start"

# 4. 查看状态
curl -s $AUTH "$DOCKER_API/containers/my-nginx/json" | jq '.State'

# 5. 查看日志
curl -s $AUTH "$DOCKER_API/containers/my-nginx/logs?stdout=true&tail=20"

# 6. 停止并删除
curl -s -X POST $AUTH "$DOCKER_API/containers/my-nginx/stop?t=10"
curl -s -X DELETE $AUTH "$DOCKER_API/containers/my-nginx?v=true"
```

### 批量清理

```bash
# 清理所有停止的容器、未使用的镜像、网络和卷
curl -s -X POST $AUTH "$DOCKER_API/containers/prune"
curl -s -X POST $AUTH "$DOCKER_API/images/prune?filters=%7B%22dangling%22%3A%5B%22true%22%5D%7D"
curl -s -X POST $AUTH "$DOCKER_API/networks/prune"
curl -s -X POST $AUTH "$DOCKER_API/volumes/prune"
```
