# 后台管理员系统文档

## 🔐 管理员系统概述

后台管理员系统提供完整的权限管理和系统监控功能，支持多角色、多权限的灵活配置。

## 📁 文件结构

```
Backend/
├── config/
│   └── admin.json          # 管理员账号配置文件
├── admin-auth.js           # 管理员认证模块
├── server.js               # 主服务器文件（已集成管理员接口）
└── ADMIN_README.md         # 本文档
```

## 👤 默认管理员账号

- **用户名**: `admin`
- **密码**: `admin123` （首次登录后必须修改）
- **角色**: `super_admin` （超级管理员）

## 🔑 权限说明

### 角色类型

1. **super_admin** (超级管理员)
   - 拥有所有权限
   - 可以创建/删除其他管理员
   - 可以修改系统设置

2. **admin** (普通管理员)
   - 拥有部分权限
   - 由超级管理员分配

### 权限列表

- `user_management` - 用户管理
- `database_management` - 数据库管理
- `system_settings` - 系统设置
- `logs_view` - 查看日志
- `backup_management` - 备份管理

## 📡 API 接口

### 1. 管理员登录

```http
POST /api/admin/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

**响应示例**:
```json
{
  "success": true,
  "message": "登录成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "admin": {
      "id": 1,
      "username": "admin",
      "role": "super_admin",
      "permissions": ["user_management", "database_management", ...]
    }
  }
}
```

### 2. 管理员登出

```http
POST /api/admin/logout
Authorization: Bearer {token}
```

### 3. 获取当前管理员信息

```http
GET /api/admin/profile
Authorization: Bearer {token}
```

### 4. 修改密码

```http
POST /api/admin/change-password
Authorization: Bearer {token}
Content-Type: application/json

{
  "oldPassword": "admin123",
  "newPassword": "newpassword123"
}
```

### 5. 获取管理员列表（仅超级管理员）

```http
GET /api/admin/list
Authorization: Bearer {token}
```

### 6. 创建新管理员（仅超级管理员）

```http
POST /api/admin/create
Authorization: Bearer {token}
Content-Type: application/json

{
  "username": "newadmin",
  "password": "password123",
  "role": "admin",
  "permissions": ["logs_view", "user_management"]
}
```

### 7. 管理员仪表盘

```http
GET /api/admin/dashboard
Authorization: Bearer {token}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "dbStatus": {
      "cockroachDB": true,
      "tidbCloudDB": true,
      "neonDB": true,
      "railwayDB": true
    },
    "stats": {
      "totalUsers": 100,
      "activeUsers": 50,
      "todayLogins": 20,
      "systemUptime": 3600
    }
  }
}
```

### 8. 查看系统日志

```http
GET /api/admin/logs
Authorization: Bearer {token}
```

### 9. 数据库状态监控

```http
GET /api/admin/database/status
Authorization: Bearer {token}
```

### 10. 用户管理

```http
GET /api/admin/users
Authorization: Bearer {token}
```

### 11. 系统设置

```http
GET /api/admin/settings
Authorization: Bearer {token}
```

## 🔒 安全特性

1. **密码加密**: 使用 bcrypt 进行密码哈希
2. **JWT Token**: 使用 JWT 进行身份验证
3. **Token 过期**: Token 24小时后自动过期
4. **登录限制**: 5次错误登录后锁定30分钟
5. **权限控制**: 基于角色的权限管理
6. **操作日志**: 记录所有管理员操作

## 🛠️ 配置说明

### 修改默认密码

首次登录后，请立即修改默认密码：

```bash
curl -X POST http://localhost:3001/api/admin/change-password \
  -H "Authorization: Bearer {your_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "oldPassword": "admin123",
    "newPassword": "your_new_password"
  }'
```

### 配置文件说明

`config/admin.json` 文件结构：

```json
{
  "admins": [
    {
      "id": 1,
      "username": "admin",
      "password": "hashed_password",
      "role": "super_admin",
      "created_at": "2026-03-31T00:00:00Z",
      "last_login": null,
      "is_active": true,
      "permissions": ["user_management", ...]
    }
  ],
  "settings": {
    "token_expiry": "24h",
    "max_login_attempts": 5,
    "lockout_duration": "30m",
    "require_2fa": false
  }
}
```

## 🧪 测试

### 测试管理员登录

```bash
curl -X POST http://localhost:3001/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

### 测试获取仪表盘

```bash
curl -X GET http://localhost:3001/api/admin/dashboard \
  -H "Authorization: Bearer {your_token}"
```

## ⚠️ 注意事项

1. **首次登录**: 必须使用默认账号登录后立即修改密码
2. **密码安全**: 密码长度至少8位，包含字母和数字
3. **Token 安全**: 不要将 Token 泄露给他人
4. **配置文件**: admin.json 文件包含敏感信息，不要提交到公共仓库
5. **备份配置**: 定期备份 admin.json 文件

## 🔧 故障排除

### 登录失败

- 检查用户名和密码是否正确
- 检查账号是否被锁定（5次错误后锁定30分钟）
- 检查 admin.json 文件是否存在

### Token 验证失败

- Token 可能已过期，需要重新登录
- Token 格式不正确，确保使用 `Bearer {token}` 格式

### 权限不足

- 检查管理员角色是否有相应权限
- 联系超级管理员分配权限

## 📞 技术支持

- **邮箱**: rao201@126.com
- **GitHub**: https://github.com/rao5201/hnchxw
