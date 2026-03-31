# 茶海虾王后端服务部署指南

## 部署到 Vercel

### 方法一：使用 Vercel CLI（推荐）

#### 1. 安装 Vercel CLI
```bash
npm i -g vercel
```

#### 2. 登录 Vercel
```bash
vercel login
```

#### 3. 配置环境变量
在 Vercel Dashboard 中设置以下环境变量：

```
COCKROACHDB_URL=postgresql://root:H5v-XBNQB21g4vgm66dQgQ@free-tier11.gcp-us-east1.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full
TIDB_HOST=gateway01.ap-southeast-1.prod.aws.tidbcloud.com
TIDB_PORT=4000
TIDB_USER=FDB9LQf8jUAPAAO7.root
TIDB_PASSWORD=FDB9LQf8jUAPAAO7
TIDB_DATABASE=test
NEON_URL=postgresql://neondb_owner:napi_23vsm7yywnm8jkprlh76g49p8zfbbskbcf5sgnap5ixj7h2u6y3t08s479canhcx@ep-fragrant-hall-a1z1b8g0-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
RAILWAY_URL=postgresql://postgres:e8f3a9a1-50d5-4381-800c-5a3e0dc8671e@roundhouse.proxy.rlwy.net:5432/railway
EMAIL_SERVICE=126
EMAIL_USER=rao201@126.com
EMAIL_PASSWORD=your-126-authorization-code
JWT_SECRET=teaking-secret-key-2026
```

#### 4. 部署
```bash
cd Backend
vercel --prod
```

### 方法二：使用 GitHub 集成

#### 1. 推送代码到 GitHub
```bash
git add .
git commit -m "部署后端服务"
git push origin main
```

#### 2. 在 Vercel 中导入项目
1. 访问 [Vercel Dashboard](https://vercel.com/dashboard)
2. 点击 "Add New Project"
3. 选择您的 GitHub 仓库
4. 配置环境变量（同上）
5. 点击 "Deploy"

## 部署到 Netlify

### 1. 安装 Netlify CLI
```bash
npm i -g netlify-cli
```

### 2. 登录 Netlify
```bash
netlify login
```

### 3. 初始化项目
```bash
cd Backend
netlify init
```

### 4. 配置环境变量
```bash
netlify env:set COCKROACHDB_URL "your-cockroachdb-url"
netlify env:set TIDB_HOST "your-tidb-host"
netlify env:set TIDB_PORT "4000"
netlify env:set TIDB_USER "your-tidb-user"
netlify env:set TIDB_PASSWORD "your-tidb-password"
netlify env:set TIDB_DATABASE "test"
netlify env:set NEON_URL "your-neon-url"
netlify env:set RAILWAY_URL "your-railway-url"
netlify env:set EMAIL_SERVICE "126"
netlify env:set EMAIL_USER "rao201@126.com"
netlify env:set EMAIL_PASSWORD "your-email-password"
netlify env:set JWT_SECRET "teaking-secret-key-2026"
```

### 5. 部署
```bash
netlify deploy --prod
```

## 验证部署

### 1. 测试 API 接口
```bash
curl https://your-domain.vercel.app/api/auth/send-email \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

### 2. 查看日志
```bash
# Vercel
vercel logs --tail

# Netlify
netlify logs --tail
```

## 注意事项

1. **环境变量**：确保所有敏感信息都设置为环境变量，不要提交到代码仓库
2. **数据库连接**：所有数据库连接字符串都需要正确配置
3. **邮件服务**：需要配置有效的邮箱授权码才能发送验证码邮件
4. **域名**：部署后可以使用 Vercel/Netlify 提供的默认域名，也可以绑定自定义域名

## 常见问题

### 1. 数据库连接失败
- 检查数据库连接字符串是否正确
- 确认数据库服务是否正常运行
- 检查防火墙设置

### 2. 邮件发送失败
- 确认邮箱授权码是否正确
- 检查邮箱服务是否开启SMTP功能
- 查看邮件服务提供商的限制

### 3. 部署失败
- 检查 package.json 中的依赖是否正确
- 确认 server.js 没有语法错误
- 查看部署日志获取详细错误信息

## API 接口文档

部署成功后，可以通过以下接口访问服务：

- **发送邮箱验证码**: `POST /api/auth/send-email`
- **发送短信验证码**: `POST /api/auth/send-sms`
- **注册/登录**: `POST /api/auth/register`
- **社交登录**: `POST /api/auth/social`

## 监控和维护

### 1. 查看应用状态
- Vercel: 访问 [Vercel Dashboard](https://vercel.com/dashboard)
- Netlify: 访问 [Netlify Dashboard](https://app.netlify.com/)

### 2. 设置监控告警
- 配置 Uptime Robot 监控服务可用性
- 设置数据库监控
- 配置邮件发送监控

### 3. 定期维护
- 定期备份数据库
- 监控数据库使用情况
- 更新依赖包