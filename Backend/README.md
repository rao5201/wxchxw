# 后端服务配置指南

## 数据库选项

### 当前配置
- **数据库**: Supabase (PostgreSQL)
- **连接方式**: `@supabase/supabase-js`

### 其他开源SQL数据库服务商推荐

#### 1. Railway
- **优势**: 提供免费的PostgreSQL数据库，部署简单
- **价格**: 免费计划包含512MB RAM, 1GB存储
- **适用场景**: 小型应用，开发测试
- **官网**: [Railway](https://railway.app/)

#### 2. PlanetScale
- **优势**: 提供免费的MySQL数据库，支持水平扩展
- **价格**: 免费计划包含10GB存储, 100万行/月
- **适用场景**: 需要MySQL的应用
- **官网**: [PlanetScale](https://planetscale.com/)

#### 3. Neon
- **优势**: 提供无服务器PostgreSQL，按需付费
- **价格**: 免费计划包含1GB存储, 10小时计算/月
- **适用场景**: 对性能有要求的应用
- **官网**: [Neon](https://neon.tech/)

#### 4. CockroachDB
- **优势**: 分布式SQL数据库，高可用性
- **价格**: 免费计划包含5GB存储
- **适用场景**: 需要高可用性的应用
- **官网**: [CockroachDB](https://www.cockroachlabs.com/)

## 集成指南

### 1. Railway集成

**步骤1**: 注册Railway账号并创建PostgreSQL数据库
**步骤2**: 获取数据库连接字符串
**步骤3**: 安装PostgreSQL驱动
```bash
npm install pg
```
**步骤4**: 修改数据库连接代码

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// 使用示例
app.post('/api/auth/register', async (req, res) => {
  try {
    const client = await pool.connect();
    // 数据库操作
    client.release();
  } catch (error) {
    console.error('数据库错误:', error);
  }
});
```

### 2. PlanetScale集成

**步骤1**: 注册PlanetScale账号并创建数据库
**步骤2**: 获取数据库连接字符串
**步骤3**: 安装MySQL驱动
```bash
npm install mysql2
```
**步骤4**: 修改数据库连接代码

```javascript
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL
});

// 使用示例
app.post('/api/auth/register', async (req, res) => {
  try {
    const [rows, fields] = await pool.execute('SELECT * FROM users WHERE phone = ?', [phone]);
    // 数据库操作
  } catch (error) {
    console.error('数据库错误:', error);
  }
});
```

### 3. Neon集成

**步骤1**: 注册Neon账号并创建数据库
**步骤2**: 获取数据库连接字符串
**步骤3**: 安装PostgreSQL驱动
```bash
npm install pg
```
**步骤4**: 修改数据库连接代码 (同Railway)

## 环境变量配置

创建 `.env` 文件，添加以下配置：

```env
# 数据库连接
DATABASE_URL="your-database-connection-string"

# 端口
PORT=3001

# 可选: Twilio配置 (用于短信验证码)
TWILIO_ACCOUNT_SID="your-twilio-account-sid"
TWILIO_AUTH_TOKEN="your-twilio-auth-token"
TWILIO_PHONE_NUMBER="your-twilio-phone-number"
```

## 部署指南

### 本地开发
```bash
cd Backend
npm install
npm start
```

### 部署到Vercel
1. 登录Vercel账号
2. 导入项目
3. 配置环境变量
4. 部署

### 部署到Netlify
1. 登录Netlify账号
2. 导入项目
3. 配置环境变量
4. 部署

## API接口文档

### 1. 注册/登录接口
- **URL**: `/api/auth/register`
- **方法**: `POST`
- **参数**:
  - `type`: 注册类型 (`phone`, `email`, `wechat`, `alipay`, `douyin`等)
  - `identifier`: 标识符 (手机号/邮箱/第三方ID)
  - `code`: 验证码 (手机号/邮箱注册时必填)
  - `source_platform`: 来源平台
- **返回**: 包含token和用户信息的JSON

### 2. 发送短信验证码
- **URL**: `/api/auth/send-sms`
- **方法**: `POST`
- **参数**:
  - `phone`: 手机号
- **返回**: 发送状态

### 3. 发送邮箱验证码
- **URL**: `/api/auth/send-email`
- **方法**: `POST`
- **参数**:
  - `email`: 邮箱
- **返回**: 发送状态

### 4. 社交登录
- **URL**: `/api/auth/social`
- **方法**: `POST`
- **参数**:
  - `platform`: 平台 (`wechat`, `alipay`, `douyin`等)
  - `code`: 授权码
- **返回**: 包含token和用户信息的JSON