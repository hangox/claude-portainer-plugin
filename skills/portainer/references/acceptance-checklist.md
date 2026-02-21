# 对话场景验收清单

> 本文档定义 Portainer Skill 的验收标准，每条按"触发输入 → 预期操作路径 → 成功标准 → 异常处理标准"四栏组织。

**变量约定：**
- `$PORTAINER_URL` — Portainer 地址
- `$AUTH` — 认证头
- `$PORTAINER_ENDPOINT_ID` — 目标环境 ID
- `$EP` — `$PORTAINER_URL/api/endpoints/$PORTAINER_ENDPOINT_ID`

---

## P0 核心验收场景

| # | 触发输入 | 预期操作 | 成功标准 | 异常处理 |
|---|----------|----------|----------|----------|
| 1 | "列出所有 stack" | 若无配置则先收集（配置发现流程）；有配置则 `GET /api/stacks` | 返回 Stack 名称、状态、类型列表；不泄漏 Env 中的敏感值 | 401→提示检查 API Key；空列表→明确提示"当前无 Stack" |
| 2 | "部署这个 docker-compose.yml 到 Portainer" | 读取文件→检测 Swarm/Compose→`POST /api/stacks/create/{type}/string?endpointId=$PORTAINER_ENDPOINT_ID` | Stack 创建成功，返回 Stack ID 和名称，容器正常启动 | 409→提示名称已存在，询问更新还是换名；400→提示 compose 格式错误并引用具体报错 |
| 3 | "重启 nginx 容器" | 搜索容器 `GET $EP/docker/containers/json?all=true` + 名称过滤→`POST $EP/docker/containers/{id}/restart` | 容器重启成功，显示新状态和运行时间 | 404→提示不存在，列出名称相近的可用容器；多个匹配→列出候选项让用户选择 |
| 4 | "查看 redis 的日志" | 搜索容器→`GET $EP/docker/containers/{id}/logs?stdout=true&stderr=true&tail=100&timestamps=true` | 显示最近 100 行日志，包含时间戳 | 容器已停止→提示容器状态，仍获取历史日志 |
| 5 | "触发 webhook 重新部署 my-stack" | 查找 Stack→获取 Webhook Token→`POST $PORTAINER_URL/api/stacks/webhooks/{token}` | 触发成功，返回 HTTP 204 | 无 Webhook→提示如何配置，提供创建命令 |
| 6 | 首次使用，无任何配置 | 按配置发现流程：检查环境变量→解析 CLAUDE.md→交互式询问 URL、认证方式→列出 endpoints 供选择 | 引导完成配置，成功执行首次操作 | URL 不通→提示检查网络和 URL 格式；认证失败→引导重新输入 |
| 7 | "更新 my-stack 的 compose 文件" | 找到 Stack→备份当前文件→读取新文件→`PUT /api/stacks/{id}?endpointId=$PORTAINER_ENDPOINT_ID` | 更新成功，显示更新后的容器状态 | Stack 不存在→列出可用 Stack 名称供选择 |
| 8 | "查看容器的资源占用情况" | 搜索容器→`GET $EP/docker/containers/{id}/stats?stream=false` | 显示 CPU%、内存用量/限制、网络 IO 统计 | 容器已停止→提示无法获取实时统计，显示最后运行状态 |

### P0 场景详细验证步骤

#### 场景 1：列出所有 Stack

```bash
# 预期调用
curl -s $AUTH "$PORTAINER_URL/api/stacks" \
  | jq '.[] | {Id, Name, Status: (if .Status == 1 then "运行中" elif .Status == 2 then "已停止" else "未知" end), Type: (if .Type == 1 then "Swarm" elif .Type == 2 then "Compose" else "其他" end)}'

# 成功输出示例：
# {"Id":5,"Name":"nginx","Status":"运行中","Type":"Compose"}
# {"Id":12,"Name":"redis","Status":"运行中","Type":"Swarm"}

# 安全检查：输出中不应包含环境变量的值
# 错误示例：不应显示 {"Env": [{"name":"DB_PASSWORD","value":"real-password"}]}
```

#### 场景 2：部署 Stack

```bash
# 步骤 1：检测环境类型
SWARM_ID=$(curl -s $AUTH "$EP/docker/swarm" | jq -r '.ID // empty')

# 步骤 2a：Compose 环境（SWARM_ID 为空）
curl -s -X POST $AUTH \
  -H "Content-Type: application/json" \
  -d '{"Name":"my-stack","StackFileContent":"<内容>","Env":[]}' \
  "$PORTAINER_URL/api/stacks/create/2/string?endpointId=$PORTAINER_ENDPOINT_ID"

# 步骤 2b：Swarm 环境（SWARM_ID 非空）
curl -s -X POST $AUTH \
  -H "Content-Type: application/json" \
  -d '{"Name":"my-stack","StackFileContent":"<内容>","SwarmID":"'$SWARM_ID'","Env":[]}' \
  "$PORTAINER_URL/api/stacks/create/1/string?endpointId=$PORTAINER_ENDPOINT_ID"

# 步骤 3：验证
curl -s $AUTH "$PORTAINER_URL/api/stacks" | jq '.[] | select(.Name == "my-stack")'
```

#### 场景 6：首次使用配置发现

```bash
# 优先级 1：检查环境变量
echo $PORTAINER_URL $PORTAINER_API_KEY

# 优先级 2：解析 CLAUDE.md（搜索关键字段）
# 搜索: "Portainer ID", "管理地址", "Portainer URL", "Portainer 名称"

# 优先级 3：交互式询问（仅在前两步均无结果时）
# 3a. 询问 Portainer URL
# 3b. 询问认证方式（API Key / 用户名密码）
# 3c. 列出可用环境
curl -s $AUTH "$PORTAINER_URL/api/endpoints" \
  | jq '.[] | {Id, Name, Status}'
# 3d. 让用户选择 Endpoint ID
```

---

## P1 次要验收场景

| # | 触发输入 | 预期操作 | 成功标准 | 异常处理 |
|---|----------|----------|----------|----------|
| 9 | "拉取最新的 nginx:1.27 镜像" | `POST $EP/docker/images/create?fromImage=nginx&tag=1.27` | 拉取成功，显示镜像大小 | 镜像名/标签不存在→提示检查名称和标签 |
| 10 | "列出所有网络" | `GET $EP/docker/networks` | 返回网络名称、驱动、作用域列表 | - |
| 11 | "查看 Docker 磁盘使用情况" | `GET $EP/docker/system/df` | 显示容器/镜像/卷的数量和占用空间 | - |
| 12 | "列出所有 Portainer 环境" | `GET /api/endpoints` | 显示环境列表（ID、名称、类型、状态） | 无环境→提示如何添加新环境 |
| 13 | "查看 Swarm 服务列表" | `GET $EP/docker/services` | 返回服务名称、镜像、副本数 | 非 Swarm 环境→提示当前环境不支持 |
| 14 | "查看某个服务的日志" | 搜索服务→`GET $EP/docker/services/{id}/logs?stdout=true&stderr=true&tail=100` | 显示聚合日志 | 服务不存在→列出可用服务 |
| 15 | "停止 my-stack" | 查找 Stack→`POST /api/stacks/{id}/stop?endpointId=$PORTAINER_ENDPOINT_ID` | Stack 停止成功 | 已停止→提示当前状态 |
| 16 | "启动 my-stack" | 查找 Stack→`POST /api/stacks/{id}/start?endpointId=$PORTAINER_ENDPOINT_ID` | Stack 启动成功 | 已运行→提示当前状态 |

### P1 场景验证步骤

#### 场景 9：拉取镜像

```bash
# 拉取镜像
curl -s -X POST $AUTH \
  "$EP/docker/images/create?fromImage=nginx&tag=1.27"

# 验证拉取结果
curl -s $AUTH "$EP/docker/images/json" \
  | jq '.[] | select(.RepoTags != null) | select(.RepoTags[] | test("nginx:1.27")) | {RepoTags, Size: (.Size / 1048576 | floor | tostring + " MB")}'
```

#### 场景 11：磁盘使用

```bash
curl -s $AUTH "$EP/docker/system/df" \
  | jq '{
    Images: {Count: (.Images | length), TotalSize: ([.Images[].Size] | add / 1073741824 * 100 | floor / 100 | tostring + " GB")},
    Containers: {Count: (.Containers | length), Running: ([.Containers[] | select(.State == "running")] | length)},
    Volumes: {Count: (.Volumes | length), TotalSize: ([.Volumes[].UsageData.Size] | add // 0 / 1073741824 * 100 | floor / 100 | tostring + " GB")}
  }'
```

---

## 防误操作验收

| # | 触发输入 | 预期行为 |
|---|----------|----------|
| 17 | "删除所有未使用的镜像" | 先调用 `GET $EP/docker/system/df` 列出将被删除的镜像清单和预计释放空间，**等待用户确认后**才执行 `POST $EP/docker/images/prune` |
| 18 | "删除 my-stack" | 先 `GET /api/stacks/{id}` 获取详情，列出 Stack 包含的服务和容器数量，**明确警告影响范围后等待确认**，确认后 `DELETE /api/stacks/{id}?endpointId=$PORTAINER_ENDPOINT_ID` |
| 19 | "强制删除容器 xxx" | `GET $EP/docker/containers/{id}/json` 显示容器信息（关联的卷、挂载、网络），**警告数据丢失风险后等待确认**，确认后 `DELETE $EP/docker/containers/{id}?force=true` |
| 20 | "清理所有停止的容器" | 列出所有已停止容器及其关联信息，**等待确认后**执行 `POST $EP/docker/containers/prune` |
| 21 | "删除这个卷" | 检查卷是否被容器使用，显示卷信息和挂载点，**警告数据不可恢复后等待确认**，确认后 `DELETE $EP/docker/volumes/{name}` |

### 防误操作验证步骤

#### 场景 17：镜像清理确认流程

```bash
# 步骤 1：列出将被清理的内容（展示给用户）
curl -s $AUTH "$EP/docker/images/json" \
  | jq '[.[] | select(.Containers == 0 or .Containers == null)] | {
    count: length,
    images: [.[] | {RepoTags, Size: (.Size / 1048576 | floor | tostring + " MB")}],
    total_size: ([.[].Size] | add / 1073741824 * 100 | floor / 100 | tostring + " GB")
  }'

# 步骤 2：等待用户确认（必须！）
# 用户确认 → 继续
# 用户拒绝 → 停止

# 步骤 3：执行清理
curl -s -X POST $AUTH "$EP/docker/images/prune"

# 步骤 4：展示结果
# 显示删除的镜像数量和释放的空间
```

#### 场景 18：Stack 删除确认流程

```bash
# 步骤 1：获取 Stack 详情
STACK_ID=42
curl -s $AUTH "$PORTAINER_URL/api/stacks/$STACK_ID" \
  | jq '{Id, Name, Status, Type, CreationDate}'

# 步骤 2：列出关联容器
curl -s $AUTH "$EP/docker/containers/json?all=true" \
  | jq '.[] | select(.Labels["com.docker.compose.project"] == "my-stack") | {Names, State, Image}'

# 步骤 3：向用户展示警告
# "即将删除 Stack 'my-stack'，包含 3 个容器：web, redis, db。此操作不可撤销。是否继续？"

# 步骤 4：用户确认后执行
curl -s -X DELETE $AUTH \
  "$PORTAINER_URL/api/stacks/$STACK_ID?endpointId=$PORTAINER_ENDPOINT_ID"
```

---

## 配置错误验收

| # | 触发条件 | 预期行为 |
|---|----------|----------|
| 22 | `PORTAINER_URL` 不正确（404/连接超时） | 明确提示"无法连接到 Portainer: <URL>"，建议检查 URL 格式、网络连通性、防火墙设置 |
| 23 | API Key 无效或已过期（HTTP 401） | 提示"认证失败：API Key 无效或已过期"，引导重新配置或通过 Portainer UI 生成新 API Key |
| 24 | Endpoint ID 不存在（HTTP 404） | 自动调用 `GET /api/endpoints` 列出所有可用环境，让用户选择正确的 ID |
| 25 | API Key 权限不足（HTTP 403） | 提示"权限不足：当前 API Key 无权执行此操作"，建议联系管理员或使用管理员 API Key |
| 26 | Portainer 服务器内部错误（HTTP 500） | 提示"Portainer 服务器异常"，建议查看 Portainer 容器日志 `docker logs <portainer>` |
| 27 | compose 文件语法错误（HTTP 400） | 解析错误响应中的 `message` 和 `details`，指出具体的语法问题和行号 |

### 配置错误验证步骤

#### 场景 22：URL 不可达

```bash
# 检测连通性
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 \
  "$PORTAINER_URL/api/system/status")

# HTTP_CODE == "000" → 连接超时/DNS 解析失败
# 提示: "无法连接到 Portainer ($PORTAINER_URL)，请检查：
#   1. URL 是否正确（包含 https:// 前缀）
#   2. 网络是否可达（ping/telnet 测试）
#   3. 防火墙是否放行"

# HTTP_CODE == "404" → URL 可达但路径不对
# 尝试回退端点:
curl -s -o /dev/null -w "%{http_code}" "$PORTAINER_URL/api/status"
```

#### 场景 24：Endpoint ID 不存在

```bash
# 请求返回 404 时，自动列出可用环境
curl -s $AUTH "$PORTAINER_URL/api/endpoints" \
  | jq '.[] | {Id, Name, Type, Status: (if .Status == 1 then "运行中" else "离线" end)}'

# 输出示例:
# {"Id":1,"Name":"local","Type":1,"Status":"运行中"}
# {"Id":2,"Name":"production","Type":2,"Status":"运行中"}
# {"Id":3,"Name":"staging","Type":2,"Status":"离线"}

# 提示用户选择正确的 Endpoint ID
```

---

## 安全相关验收

| # | 场景 | 预期行为 |
|---|------|----------|
| 28 | 输出包含环境变量 | 含 PASSWORD / SECRET / KEY / TOKEN 的值用 `***` 掩码显示 |
| 29 | 日志输出包含 API Key | API Key 仅显示前 8 位 + `...`（如 `ptr_abcd...`） |
| 30 | 用户请求导出凭据 | 拒绝明文导出，提示通过 Portainer UI 管理凭据 |

### 安全验证步骤

```bash
# 列出 Stack 时，环境变量需要脱敏处理
curl -s $AUTH "$PORTAINER_URL/api/stacks" \
  | jq '.[] | {Name, Env: [.Env[]? | {name: .name, value: (if (.name | test("PASSWORD|SECRET|KEY|TOKEN"; "i")) then "***" else .value end)}]}'

# 正确输出示例:
# {"Name":"my-stack","Env":[{"name":"DB_HOST","value":"localhost"},{"name":"DB_PASSWORD","value":"***"}]}
```

---

## 验收执行检查表

以下为手动验收时的逐项检查清单：

- [ ] P0-1: 列出 Stack 正常返回，敏感值已掩码
- [ ] P0-2: 部署新 Stack 成功，Swarm/Compose 自动判断
- [ ] P0-3: 重启容器成功，模糊匹配正常
- [ ] P0-4: 查看日志正常，含时间戳
- [ ] P0-5: Webhook 触发成功
- [ ] P0-6: 首次配置引导流程完整
- [ ] P0-7: 更新 Stack 成功，有备份
- [ ] P0-8: 资源统计正常显示
- [ ] P1-9~16: 次要场景功能正常
- [ ] 防误操作-17~21: 所有破坏性操作均有确认步骤
- [ ] 配置错误-22~27: 所有错误场景有明确提示
- [ ] 安全-28~30: 敏感信息脱敏正确
