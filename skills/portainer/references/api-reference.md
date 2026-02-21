# Portainer API 参考

> 基于 Portainer CE 2.33.7

## 概览

- **基础路径**: `/api`
- **完整请求 URL**: `$PORTAINER_URL/api/{path}`
- **认证方式**:
  - API Key: `X-API-Key: ptr_...`
  - JWT: `Authorization: Bearer <token>`
- **内容类型**: `application/json`（除文件上传外）
- **变量约定**: 本文档示例使用以下环境变量
  - `$PORTAINER_URL` — Portainer 地址（如 `https://portainer2.hangox.com`）
  - `$AUTH` — 认证头（如 `-H "X-API-Key: ptr_..."` 或 `-H "Authorization: Bearer ..."`)
  - `$PORTAINER_ENDPOINT_ID` — 目标环境 ID

---

## 认证

| 方法 | 路径 | 说明 | Body/参数 |
|------|------|------|-----------|
| POST | /api/auth | 获取 JWT | `{"Username":"","Password":""}` → `{"jwt":""}` |
| POST | /api/users/{id}/tokens | 生成 API Key | `{"description":"","password":"用户密码"}` → `{"rawAPIKey":"ptr_..."}` |

```bash
# 获取 JWT Token
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"Username":"admin","Password":"secret"}' \
  "$PORTAINER_URL/api/auth" | jq -r '.jwt'

# 生成 API Key（需已认证，且需提供当前用户密码）
curl -s -X POST $AUTH \
  -H "Content-Type: application/json" \
  -d '{"description":"claude-code","password":"用户密码"}' \
  "$PORTAINER_URL/api/users/1/tokens" | jq -r '.rawAPIKey'
```

---

## 环境管理 (Endpoints)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/endpoints | 列出所有环境 |
| GET | /api/endpoints/{id} | 获取环境详情 |
| POST | /api/endpoints | 创建环境（需 multipart/form-data） |
| PUT | /api/endpoints/{id} | 更新环境 |
| DELETE | /api/endpoints/{id} | 删除环境 |

**环境类型 (Type)**:
- `1` — Docker（本地 socket）
- `2` — Docker Agent
- `4` — Docker Edge Agent
- `5` — Azure ACI

```bash
# 列出所有环境
curl -s $AUTH "$PORTAINER_URL/api/endpoints" | jq '.[] | {Id, Name, Type, Status}'

# 获取环境详情
curl -s $AUTH "$PORTAINER_URL/api/endpoints/$PORTAINER_ENDPOINT_ID" | jq '{Id, Name, Type, Status, URL}'
```

---

## Stack 管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/stacks | 列出所有 Stack |
| GET | /api/stacks/{id} | 获取 Stack 详情 |
| GET | /api/stacks/{id}/file | 获取 Stack 编排文件 |
| POST | /api/stacks/create/{type}/{method}?endpointId={id} | 创建 Stack |
| PUT | /api/stacks/{id}?endpointId={id} | 更新 Stack |
| POST | /api/stacks/{id}/start?endpointId={id} | 启动 Stack |
| POST | /api/stacks/{id}/stop?endpointId={id} | 停止 Stack |
| DELETE | /api/stacks/{id}?endpointId={id} | 删除 Stack |
| PUT | /api/stacks/{id}/git/redeploy?endpointId={id} | Git 重部署 |
| POST | /api/stacks/webhooks/{webhookID} | Webhook 触发（公开，无需认证） |

**Stack 创建参数**:
- `type`: `1` = Swarm（别名 `swarm`）, `2` = Compose（别名 `standalone`）, `3` = Kubernetes
- `method`: `string`（内联 YAML）, `file`（上传文件）, `repository`（Git 仓库）

> **版本兼容提示**: 部分 Portainer 版本（如 2.24.x）使用文字别名路径 `/api/stacks/create/standalone/string`，而非数字 `/api/stacks/create/2/string`。建议先尝试数字格式，404 时回退到别名格式。

```bash
# 列出所有 Stack
curl -s $AUTH "$PORTAINER_URL/api/stacks" | jq '.[] | {Id, Name, Status, Type}'

# 获取 Stack 编排文件
curl -s $AUTH "$PORTAINER_URL/api/stacks/5/file" | jq -r '.StackFileContent'

# 创建 Compose Stack（内联方式）
curl -s -X POST $AUTH \
  -H "Content-Type: application/json" \
  -d '{
    "Name": "my-stack",
    "StackFileContent": "version: \"3\"\nservices:\n  web:\n    image: nginx:1.27",
    "Env": []
  }' \
  "$PORTAINER_URL/api/stacks/create/2/string?endpointId=$PORTAINER_ENDPOINT_ID"

# 创建 Swarm Stack（内联方式）
curl -s -X POST $AUTH \
  -H "Content-Type: application/json" \
  -d '{
    "Name": "my-swarm-stack",
    "StackFileContent": "version: \"3.8\"\nservices:\n  web:\n    image: nginx:1.27\n    deploy:\n      replicas: 2",
    "SwarmID": "your-swarm-id",
    "Env": []
  }' \
  "$PORTAINER_URL/api/stacks/create/1/string?endpointId=$PORTAINER_ENDPOINT_ID"

# 更新 Stack（修改编排文件）
curl -s -X PUT $AUTH \
  -H "Content-Type: application/json" \
  -d '{
    "StackFileContent": "version: \"3\"\nservices:\n  web:\n    image: nginx:1.28",
    "Env": [],
    "Prune": false
  }' \
  "$PORTAINER_URL/api/stacks/5?endpointId=$PORTAINER_ENDPOINT_ID"

# 启动/停止 Stack
curl -s -X POST $AUTH "$PORTAINER_URL/api/stacks/5/start?endpointId=$PORTAINER_ENDPOINT_ID"
curl -s -X POST $AUTH "$PORTAINER_URL/api/stacks/5/stop?endpointId=$PORTAINER_ENDPOINT_ID"

# 删除 Stack
curl -s -X DELETE $AUTH "$PORTAINER_URL/api/stacks/5?endpointId=$PORTAINER_ENDPOINT_ID"

# 通过 Webhook 触发重部署（无需认证）
curl -s -X POST "$PORTAINER_URL/api/stacks/webhooks/{webhookID}"
```

---

## Webhook 管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/webhooks | 列出 Webhook |
| POST | /api/webhooks | 创建 Webhook |
| DELETE | /api/webhooks/{id} | 删除 Webhook |
| POST | /api/stacks/webhooks/{webhookID} | 触发 Webhook（公开，无需认证） |

```bash
# 列出所有 Webhook
curl -s $AUTH "$PORTAINER_URL/api/webhooks" | jq '.[] | {Id, Token, ResourceID, WebhookType}'

# 创建 Webhook（针对 Stack 或 Service）
curl -s -X POST $AUTH \
  -H "Content-Type: application/json" \
  -d '{
    "ResourceID": "service-id-or-stack-id",
    "EndpointID": 2,
    "WebhookType": 1,
    "RegistryID": 0
  }' \
  "$PORTAINER_URL/api/webhooks"
```

---

## 系统

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/system/status | 系统状态（2.33+） |
| GET | /api/status | 系统状态（旧版回退） |
| GET | /api/system/info | 系统信息 |
| GET | /api/system/version | Portainer 版本 |

```bash
# 获取系统状态（优先使用 2.33+ 端点，失败回退旧端点）
curl -s $AUTH "$PORTAINER_URL/api/system/status" || \
curl -s $AUTH "$PORTAINER_URL/api/status"

# 获取 Portainer 版本
curl -s $AUTH "$PORTAINER_URL/api/system/version" | jq '{ServerVersion, DatabaseVersion, Build}'
```

---

## 用户管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/users | 列出用户 |
| GET | /api/users/{id} | 获取用户 |
| POST | /api/users | 创建用户 |
| PUT | /api/users/{id} | 更新用户 |
| DELETE | /api/users/{id} | 删除用户 |

**用户角色**: `1` = 管理员, `2` = 普通用户

```bash
# 列出所有用户
curl -s $AUTH "$PORTAINER_URL/api/users" | jq '.[] | {Id, Username, Role}'

# 创建用户
curl -s -X POST $AUTH \
  -H "Content-Type: application/json" \
  -d '{"Username":"newuser","Password":"SecurePass123!","Role":2}' \
  "$PORTAINER_URL/api/users"
```

---

## 镜像仓库 (Registries)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/registries | 列出仓库 |
| POST | /api/registries | 创建仓库 |
| PUT | /api/registries/{id} | 更新仓库 |
| DELETE | /api/registries/{id} | 删除仓库 |

**仓库类型**: `1` = Quay, `2` = Azure, `3` = Custom, `4` = GitLab, `5` = ProGet, `6` = DockerHub, `7` = ECR, `8` = GitHub

```bash
# 列出所有仓库
curl -s $AUTH "$PORTAINER_URL/api/registries" | jq '.[] | {Id, Name, URL, Type}'

# 创建自定义仓库
curl -s -X POST $AUTH \
  -H "Content-Type: application/json" \
  -d '{
    "Name": "my-registry",
    "Type": 3,
    "URL": "registry.example.com",
    "Authentication": true,
    "Username": "user",
    "Password": "pass"
  }' \
  "$PORTAINER_URL/api/registries"
```

---

## 自定义模板

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/custom_templates | 列出模板 |
| POST | /api/custom_templates/string | 创建模板（内联） |
| DELETE | /api/custom_templates/{id} | 删除模板 |

```bash
# 列出所有自定义模板
curl -s $AUTH "$PORTAINER_URL/api/custom_templates" | jq '.[] | {Id, Title, Type}'

# 创建自定义模板
curl -s -X POST $AUTH \
  -H "Content-Type: application/json" \
  -d '{
    "Title": "Nginx Template",
    "Description": "Standard Nginx deployment",
    "FileContent": "version: \"3\"\nservices:\n  web:\n    image: nginx:1.27",
    "Type": 2,
    "Platform": 1
  }' \
  "$PORTAINER_URL/api/custom_templates/string"
```

---

## 备份与恢复

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/backup | 创建备份（下载 tar.gz） |
| POST | /api/restore | 恢复备份（上传 tar.gz） |

```bash
# 创建备份（加密）
curl -s -X POST $AUTH \
  -H "Content-Type: application/json" \
  -d '{"password":"backup-secret"}' \
  -o portainer-backup.tar.gz \
  "$PORTAINER_URL/api/backup"

# 恢复备份
curl -s -X POST $AUTH \
  -F "file=@portainer-backup.tar.gz" \
  -F "password=backup-secret" \
  "$PORTAINER_URL/api/restore"
```

---

## 错误码参考

| 状态码 | 含义 | 常见场景 |
|--------|------|----------|
| 200 | 成功 | GET / PUT 操作 |
| 204 | 成功，无返回体 | DELETE 操作 |
| 400 | 请求参数错误 | 缺少必填字段、JSON 格式错误 |
| 401 | 未认证 | API Key 无效或已过期、JWT 过期 |
| 403 | 无权限 | 用户权限不足、资源访问受限 |
| 404 | 资源不存在 | Stack/Endpoint ID 不存在 |
| 409 | 资源冲突 | Stack 名称已存在、端口被占用 |
| 500 | 服务器内部错误 | Portainer 内部异常 |

**错误响应格式**:
```json
{
  "message": "错误简述",
  "details": "详细错误信息"
}
```

---

## 版本差异注记

| 特性 | 2.33+ | 2.24.x | 旧版 (< 2.20) |
|------|-------|--------|---------------|
| Stack 创建路径 | `/api/stacks/create/2/string` | `/api/stacks/create/standalone/string` | `/api/stacks?type=2&method=string` |
| 系统状态端点 | `/api/system/status` | `/api/status` | `/api/status` |
| 系统版本端点 | `/api/system/version` | `/api/status`（嵌在返回中） | `/api/status` |
| Webhook 触发 | `/api/stacks/webhooks/{id}` | 相同 | 相同 |

**已验证的 API 行为差异（基于自动化测试）：**
- **Docker 代理状态码**：通过 Portainer 代理调用 Docker API 时，网络/卷创建返回 `200`（标准 Docker API 返回 `201`）
- **镜像拉取返回格式**：`POST .../docker/images/create` 返回流式 NDJSON（每行一个 JSON 对象），非标准 JSON
- **API Key 创建**：`POST /api/users/{id}/tokens` 需要在 body 中包含 `password` 字段
- **Endpoint 注册**：`POST /api/endpoints` 需要 `multipart/form-data` 格式，不支持 JSON body

建议在调用时优先使用新版端点，失败时回退到旧版端点以保持兼容性。
