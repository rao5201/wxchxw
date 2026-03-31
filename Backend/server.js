const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const mysql = require('mysql2/promise');
const twilio = require('twilio');
const nodemailer = require('nodemailer');
require('dotenv').config();

// 导入管理员认证模块
const {
    adminLogin,
    adminLogout,
    changePassword,
    createAdmin,
    getAdminList,
    authMiddleware,
    requirePermission
} = require('./admin-auth');

// 初始化Twilio (仅在配置了有效凭证时)
let twilioClient = null;
try {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && 
      process.env.TWILIO_ACCOUNT_SID.startsWith('AC')) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    console.log('✅ Twilio 初始化成功');
  } else {
    console.log('⚠️ Twilio 未配置，短信功能将不可用');
  }
} catch (error) {
  console.error('❌ Twilio 初始化失败:', error.message);
  twilioClient = null;
}

const app = express();
app.use(cors());
app.use(express.json());

// 数据库连接配置
let cockroachDB = null; // 即时数据
let tidbCloudDB = null; // 日备份数据（TiDB Cloud替代Supabase）
let neonDB = null; // 备份数据
let railwayDB = null; // 临时数据

// 初始化CockroachDB (PostgreSQL)
try {
  if (process.env.COCKROACHDB_URL) {
    cockroachDB = new Pool({
      connectionString: process.env.COCKROACHDB_URL,
      ssl: {
        rejectUnauthorized: false
      }
    });
    console.log('✅ CockroachDB 连接初始化成功');
  }
} catch (error) {
  console.error('❌ CockroachDB 连接初始化失败:', error);
}

// 初始化TiDB Cloud (MySQL兼容，替代Supabase作为日备份)
try {
  if (process.env.TIDB_HOST && process.env.TIDB_USER && process.env.TIDB_PASSWORD) {
    tidbCloudDB = mysql.createPool({
      host: process.env.TIDB_HOST,
      port: process.env.TIDB_PORT || 4000,
      user: process.env.TIDB_USER,
      password: process.env.TIDB_PASSWORD,
      database: process.env.TIDB_DATABASE || 'test',
      ssl: {
        rejectUnauthorized: false
      }
    });
    console.log('✅ TiDB Cloud 连接初始化成功');
  }
} catch (error) {
  console.error('❌ TiDB Cloud 连接初始化失败:', error);
}

// 初始化Neon (PostgreSQL)
try {
  if (process.env.NEON_URL) {
    neonDB = new Pool({
      connectionString: process.env.NEON_URL,
      ssl: {
        rejectUnauthorized: false
      }
    });
    console.log('✅ Neon 连接初始化成功');
  }
} catch (error) {
  console.error('❌ Neon 连接初始化失败:', error);
}

// 初始化Railway (PostgreSQL)
try {
  if (process.env.RAILWAY_URL) {
    railwayDB = new Pool({
      connectionString: process.env.RAILWAY_URL,
      ssl: {
        rejectUnauthorized: false
      }
    });
    console.log('✅ Railway 连接初始化成功');
  }
} catch (error) {
  console.error('❌ Railway 连接初始化失败:', error);
}

// 初始化邮件服务 (用于发送验证码)
let emailTransporter = null;
try {
  if (process.env.EMAIL_SERVICE && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
    emailTransporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE, // 如 'QQ', '163', 'Gmail' 等
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
    console.log('✅ 邮件服务初始化成功');
  } else {
    console.log('⚠️ 邮件服务未配置，验证码功能将使用内存存储');
  }
} catch (error) {
  console.error('❌ 邮件服务初始化失败:', error.message);
  emailTransporter = null;
}

// 数据库操作封装
const db = {
  // 即时数据操作 (CockroachDB)
  async instantQuery(query, params) {
    if (!cockroachDB) {
      console.warn('⚠️ CockroachDB 未连接，使用备用数据库');
      return this.backupQuery(query, params);
    }
    try {
      const client = await cockroachDB.connect();
      const result = await client.query(query, params);
      client.release();
      return result;
    } catch (error) {
      console.error('CockroachDB 查询失败:', error);
      return this.backupQuery(query, params);
    }
  },
  
  // 备份数据操作 (Neon)
  async backupQuery(query, params) {
    if (!neonDB) {
      console.warn('⚠️ Neon 未连接，使用临时数据库');
      return this.tempQuery(query, params);
    }
    try {
      const client = await neonDB.connect();
      const result = await client.query(query, params);
      client.release();
      return result;
    } catch (error) {
      console.error('Neon 查询失败:', error);
      return this.tempQuery(query, params);
    }
  },
  
  // 临时数据操作 (Railway)
  async tempQuery(query, params) {
    if (!railwayDB) {
      console.warn('⚠️ Railway 未连接，使用内存存储');
      return { rows: [] };
    }
    try {
      const client = await railwayDB.connect();
      const result = await client.query(query, params);
      client.release();
      return result;
    } catch (error) {
      console.error('Railway 查询失败:', error);
      return { rows: [] };
    }
  },
  
  // 日备份操作 (TiDB Cloud替代Supabase)
  async dailyBackup(data) {
    if (!tidbCloudDB) {
      console.warn('⚠️ TiDB Cloud 未连接，跳过备份');
      return false;
    }
    try {
      // 使用TiDB Cloud存储日备份数据
      const [result] = await tidbCloudDB.execute(
        `INSERT INTO daily_backups (action, user_id, platform, timestamp, created_at) 
         VALUES (?, ?, ?, ?, ?)`,
        [data.action, data.user_id, data.platform || null, data.timestamp, new Date().toISOString()]
      );
      
      console.log('📅 执行日备份:', data);
      return true;
    } catch (error) {
      console.error('TiDB Cloud 备份失败:', error);
      return false;
    }
  }
};

// --- 内存级风控记录 (重启后重置，生产环境建议用 Redis) ---
// 格式: { "192.168.1.1": { count: 1, firstTime: 171234567890 } }
const IPRegistry = {};

// --- 核心接口：统一认证中心 (支持手机号/第三方) ---  
app.post('/api/auth/register', async (req, res) => {
    const { type, identifier, code, source_platform } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;
    const currentTime = Date.now();

    console.log(`📩 [注册请求] IP=${clientIP}, Type=${type}, ID=${identifier}`);

    // 1. IP 风控检查 (策略: 3次封禁 72小时)
    if (!IPRegistry[clientIP]) {
        IPRegistry[clientIP] = { count: 0, firstTime: currentTime };
    }

    const ipRecord = IPRegistry[clientIP];
    
    // 检查是否在72小时管控期内
    if (currentTime - ipRecord.firstTime < 72 * 60 * 60 * 1000) {
        if (ipRecord.count >= 3) {
            return res.status(403).json({
                success: false,
                message: "操作频繁，该IP已被管控 72 小时",
                code: "IP_BLOCKED"
            });
        }
    } else {
        // 超过72小时，重置计数
        ipRecord.count = 0;
        ipRecord.firstTime = currentTime;
    }

    // 2. 验证逻辑分流
    let isVerified = false;

    // 策略1 & 2: 手机号/邮箱 -> 固定验证码 888888
    if (type === 'phone' || type === 'email') {
        if (code === '888888') {
            isVerified = true;
        } else {
            return res.status(401).json({ success: false, message: "验证码错误" });
        }
    } 
    // 策略3: 第三方 (微信/支付宝/抖音等) -> 直接信任，自动注册
    else if (['wechat', 'alipay', 'douyin', 'kuaishou', 'xiaohongshu', 'taobao', 'pdd', 'jd'].includes(type)) {
        isVerified = true; 
    } else {
        return res.status(400).json({ success: false, message: "不支持的注册类型" });
    }

    if (!isVerified) {
        return res.status(401).json({ success: false, message: "验证失败" });
    }

    // 3. 数据库查重与自动注册 (策略4 & 5)
    let user = null;
    let isNew = false;

    try {
        // 查询用户是否存在
        let query = '';
        let params = [];
        
        if (type === 'phone') {
            query = 'SELECT * FROM users WHERE phone = $1';
            params = [identifier];
        } else if (type === 'email') {
            query = 'SELECT * FROM users WHERE email = $1';
            params = [identifier];
        } else {
            query = 'SELECT * FROM users WHERE union_id = $1';
            params = [identifier];
        }

        const result = await db.instantQuery(query, params);
        user = result.rows[0];

        if (!user) {
            // --- 新用户：自动创建 ---
            const insertQuery = `
                INSERT INTO users (username, phone, email, union_id, source_platform, is_auto_generated, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
            `;
            
            const insertParams = [
                `茶友_${Math.floor(Math.random() * 10000)}`, // 随机昵称
                type === 'phone' ? identifier : null,
                type === 'email' ? identifier : null,
                ['wechat', 'alipay', 'douyin', 'kuaishou', 'xiaohongshu', 'taobao', 'pdd', 'jd'].includes(type) ? identifier : null,
                source_platform || type,
                true,
                new Date().toISOString()
            ];

            const insertResult = await db.instantQuery(insertQuery, insertParams);
            user = insertResult.rows[0];
            isNew = true;
            
            // 只有新用户才增加 IP 计数 (老用户登录不算)
            ipRecord.count += 1;
            console.log(`🆕 [新用户注册] ID=${user.id}, 来源=${type}`);

            // 执行日备份
            await db.dailyBackup({
                action: 'user_register',
                user_id: user.id,
                timestamp: new Date().toISOString()
            });
        } else {
            console.log(`✅ [老用户登录] ID=${user.id}, 来源=${type}`);
        }
    } catch (error) {
        console.error("注册失败:", error);
        // 如果数据库操作失败，使用内存存储作为 fallback
        return res.status(500).json({ success: false, message: "注册失败，数据库连接异常" });
    }

    // 4. 返回 Token (策略6: 方便管理)
    res.json({
        success: true,
        data: {
            token: `token_${user.id}`, // 真实环境请用 jwt.sign
            user_id: user.id,
            username: user.username,
            is_new_user: isNew
        }
    });
});

// --- 发送短信验证码接口 ---
app.post('/api/auth/send-sms', async (req, res) => {
    const { phone } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;
    const currentTime = Date.now();

    console.log(`📩 [发送短信验证码] IP=${clientIP}, Phone=${phone}`);

    // 1. IP 风控检查
    if (!IPRegistry[clientIP]) {
        IPRegistry[clientIP] = { count: 0, firstTime: currentTime };
    }

    const ipRecord = IPRegistry[clientIP];
    if (currentTime - ipRecord.firstTime < 60 * 60 * 1000) {
        if (ipRecord.count >= 5) {
            return res.status(403).json({
                success: false,
                message: "操作频繁，该IP已被限制 1 小时",
                code: "IP_BLOCKED"
            });
        }
    } else {
        ipRecord.count = 0;
        ipRecord.firstTime = currentTime;
    }

    // 2. 验证手机号格式
    if (!/^1[3-9]\d{9}$/.test(phone)) {
        return res.status(400).json({ success: false, message: "手机号格式错误" });
    }

    // 3. 生成验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString(); // 生成6位随机验证码

    // 4. 发送短信（如果Twilio可用）
    if (twilioClient && process.env.TWILIO_PHONE_NUMBER) {
        try {
            await twilioClient.messages.create({
                body: `您的茶海心遇验证码是: ${code}，有效期10分钟`,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: `+86${phone}`
            });
            console.log(`✅ [短信发送成功] Phone=${phone}, Code=${code}`);
        } catch (error) {
            console.error("短信发送失败:", error);
            // 短信发送失败不影响流程，返回成功
        }
    } else {
        // 如果Twilio不可用，提示用户使用邮箱验证
        console.log(`⚠️ [短信服务不可用] Phone=${phone}, 建议使用邮箱验证`);
    }

    // 5. 增加IP计数
    ipRecord.count += 1;

    // 6. 返回成功
    res.json({
        success: true,
        message: twilioClient ? "验证码已发送" : "短信服务暂不可用，请使用邮箱验证",
        code: code // 测试环境返回验证码
    });
});

// --- 发送邮箱验证码接口 ---
app.post('/api/auth/send-email', async (req, res) => {
    const { email } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;
    const currentTime = Date.now();

    console.log(`📩 [发送邮箱验证码] IP=${clientIP}, Email=${email}`);

    // 1. IP 风控检查
    if (!IPRegistry[clientIP]) {
        IPRegistry[clientIP] = { count: 0, firstTime: currentTime };
    }

    const ipRecord = IPRegistry[clientIP];
    if (currentTime - ipRecord.firstTime < 60 * 60 * 1000) {
        if (ipRecord.count >= 5) {
            return res.status(403).json({
                success: false,
                message: "操作频繁，该IP已被限制 1 小时",
                code: "IP_BLOCKED"
            });
        }
    } else {
        ipRecord.count = 0;
        ipRecord.firstTime = currentTime;
    }

    // 2. 验证邮箱格式
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, message: "邮箱格式错误" });
    }

    // 3. 生成验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString(); // 生成6位随机验证码

    // 4. 发送邮件（如果邮件服务可用）
    if (emailTransporter) {
        try {
            await emailTransporter.sendMail({
                from: process.env.EMAIL_USER,
                to: email,
                subject: '茶海心遇 - 邮箱验证码',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #6c5ce7;">茶海心遇 - 邮箱验证</h2>
                        <p>您好！</p>
                        <p>您的验证码是：<strong style="font-size: 24px; color: #6c5ce7;">${code}</strong></p>
                        <p>验证码有效期为10分钟，请尽快使用。</p>
                        <p>如果这不是您的操作，请忽略此邮件。</p>
                        <br>
                        <p>茶海心遇团队</p>
                    </div>
                `
            });
            console.log(`✅ [邮件发送成功] Email=${email}, Code=${code}`);
        } catch (error) {
            console.error("邮件发送失败:", error);
            return res.status(500).json({ success: false, message: "邮件发送失败，请稍后重试" });
        }
    } else {
        // 如果邮件服务不可用，仅记录日志
        console.log(`⚠️ [邮件服务不可用] Email=${email}, Code=${code}`);
    }

    // 5. 增加IP计数
    ipRecord.count += 1;

    // 6. 返回成功
    res.json({
        success: true,
        message: emailTransporter ? "验证码已发送到您的邮箱" : "邮件服务暂不可用，验证码已生成",
        code: code // 测试环境返回验证码
    });
});

// --- 社交登录接口 (占位) ---  
app.post('/api/auth/social', async (req, res) => {
    const { platform, code } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;
    const currentTime = Date.now();

    console.log(`📩 [社交登录] IP=${clientIP}, Platform=${platform}`);

    // 1. IP 风控检查
    if (!IPRegistry[clientIP]) {
        IPRegistry[clientIP] = { count: 0, firstTime: currentTime };
    }

    const ipRecord = IPRegistry[clientIP];
    if (currentTime - ipRecord.firstTime < 60 * 60 * 1000) {
        if (ipRecord.count >= 10) {
            return res.status(403).json({
                success: false,
                message: "操作频繁，该IP已被限制 1 小时",
                code: "IP_BLOCKED"
            });
        }
    } else {
        ipRecord.count = 0;
        ipRecord.firstTime = currentTime;
    }

    // 2. 验证平台
    const validPlatforms = ['wechat', 'alipay', 'douyin', 'kuaishou', 'xiaohongshu', 'taobao', 'pdd', 'jd'];
    if (!validPlatforms.includes(platform)) {
        return res.status(400).json({ success: false, message: "不支持的平台" });
    }

    // 3. 模拟社交登录流程
    // 实际项目中，这里应该调用对应平台的API进行验证
    const unionId = `${platform}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 4. 数据库查重与自动注册
    let user = null;
    let isNew = false;

    try {
        // 查询用户是否存在
        const query = 'SELECT * FROM users WHERE union_id = $1';
        const result = await db.instantQuery(query, [unionId]);
        user = result.rows[0];

        if (!user) {
            // 新用户
            const insertQuery = `
                INSERT INTO users (username, union_id, source_platform, is_auto_generated, created_at)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `;
            
            const insertParams = [
                `${platform === 'wechat' ? '微信' : platform === 'alipay' ? '支付宝' : platform === 'douyin' ? '抖音' : '社交'}用户_${Math.floor(Math.random() * 10000)}`,
                unionId,
                platform,
                true,
                new Date().toISOString()
            ];

            const insertResult = await db.instantQuery(insertQuery, insertParams);
            user = insertResult.rows[0];
            isNew = true;
            ipRecord.count += 1;
            console.log(`🆕 [新用户注册] ID=${user.id}, 来源=${platform}`);

            // 执行日备份
            await db.dailyBackup({
                action: 'social_login_register',
                user_id: user.id,
                platform: platform,
                timestamp: new Date().toISOString()
            });
        } else {
            console.log(`✅ [老用户登录] ID=${user.id}, 来源=${platform}`);
        }
    } catch (error) {
        console.error("注册失败:", error);
        return res.status(500).json({ success: false, message: "注册失败，数据库连接异常" });
    }

    // 5. 返回 Token
    res.json({
        success: true,
        data: {
            token: `token_${user.id}`,
            user_id: user.id,
            username: user.username,
            is_new_user: isNew
        }
    });
});

// --- 兼容旧代码：抖音登录接口 (建议后续合并到上面) ---
app.post('/api/auth/login', async (req, res) => {
    // 这里保留你之前的逻辑作为兼容，或者重定向到上面的 /register 接口
    res.json({ message: "请使用 /api/auth/register 接口进行统一登录/注册" });
});

// ==================== 管理员接口 ====================

// --- 管理员登录 ---
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
    }
    
    const result = await adminLogin(username, password);
    res.status(result.success ? 200 : 401).json(result);
});

// --- 管理员登出 ---
app.post('/api/admin/logout', authMiddleware, (req, res) => {
    const result = adminLogout(req.token);
    res.json(result);
});

// --- 获取当前管理员信息 ---
app.get('/api/admin/profile', authMiddleware, (req, res) => {
    res.json({
        success: true,
        data: req.admin
    });
});

// --- 修改密码 ---
app.post('/api/admin/change-password', authMiddleware, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    
    if (!oldPassword || !newPassword) {
        return res.status(400).json({ success: false, message: '原密码和新密码不能为空' });
    }
    
    const result = await changePassword(req.admin.id, oldPassword, newPassword);
    res.status(result.success ? 200 : 400).json(result);
});

// --- 获取管理员列表（仅超级管理员） ---
app.get('/api/admin/list', authMiddleware, (req, res) => {
    const result = getAdminList(req.token);
    res.status(result.success ? 200 : 403).json(result);
});

// --- 创建新管理员（仅超级管理员） ---
app.post('/api/admin/create', authMiddleware, async (req, res) => {
    const { username, password, role, permissions } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
    }
    
    const result = await createAdmin(req.token, {
        username,
        password,
        role: role || 'admin',
        permissions: permissions || ['logs_view']
    });
    
    res.status(result.success ? 201 : 403).json(result);
});

// --- 管理员仪表盘数据 ---
app.get('/api/admin/dashboard', authMiddleware, requirePermission('system_settings'), async (req, res) => {
    try {
        // 获取数据库连接状态
        const dbStatus = {
            cockroachDB: !!cockroachDB,
            tidbCloudDB: !!tidbCloudDB,
            neonDB: !!neonDB,
            railwayDB: !!railwayDB
        };
        
        // 获取系统统计信息（示例数据）
        const stats = {
            totalUsers: 0,  // 可以从数据库查询
            activeUsers: 0,
            todayLogins: 0,
            systemUptime: process.uptime()
        };
        
        res.json({
            success: true,
            data: {
                dbStatus,
                stats,
                admin: req.admin
            }
        });
    } catch (error) {
        console.error('获取仪表盘数据失败:', error);
        res.status(500).json({ success: false, message: '获取数据失败' });
    }
});

// --- 系统日志查看（需要权限） ---
app.get('/api/admin/logs', authMiddleware, requirePermission('logs_view'), (req, res) => {
    // 这里可以实现日志查看功能
    res.json({
        success: true,
        message: '日志功能开发中...',
        data: []
    });
});

// --- 数据库管理（需要权限） ---
app.get('/api/admin/database/status', authMiddleware, requirePermission('database_management'), async (req, res) => {
    try {
        const status = {
            cockroachDB: { connected: false, latency: null },
            tidbCloudDB: { connected: false, latency: null },
            neonDB: { connected: false, latency: null },
            railwayDB: { connected: false, latency: null }
        };
        
        // 测试CockroachDB连接
        if (cockroachDB) {
            try {
                const start = Date.now();
                await cockroachDB.query('SELECT 1');
                status.cockroachDB = { connected: true, latency: Date.now() - start };
            } catch (e) {
                status.cockroachDB = { connected: false, error: e.message };
            }
        }
        
        // 测试TiDB Cloud连接
        if (tidbCloudDB) {
            try {
                const start = Date.now();
                await tidbCloudDB.execute('SELECT 1');
                status.tidbCloudDB = { connected: true, latency: Date.now() - start };
            } catch (e) {
                status.tidbCloudDB = { connected: false, error: e.message };
            }
        }
        
        // 测试Neon连接
        if (neonDB) {
            try {
                const start = Date.now();
                await neonDB.query('SELECT 1');
                status.neonDB = { connected: true, latency: Date.now() - start };
            } catch (e) {
                status.neonDB = { connected: false, error: e.message };
            }
        }
        
        // 测试Railway连接
        if (railwayDB) {
            try {
                const start = Date.now();
                await railwayDB.query('SELECT 1');
                status.railwayDB = { connected: true, latency: Date.now() - start };
            } catch (e) {
                status.railwayDB = { connected: false, error: e.message };
            }
        }
        
        res.json({ success: true, data: status });
    } catch (error) {
        console.error('获取数据库状态失败:', error);
        res.status(500).json({ success: false, message: '获取数据库状态失败' });
    }
});

// --- 用户管理（需要权限） ---
app.get('/api/admin/users', authMiddleware, requirePermission('user_management'), async (req, res) => {
    try {
        // 从CockroachDB查询用户列表
        const query = 'SELECT id, username, phone, email, created_at, last_login FROM users ORDER BY created_at DESC LIMIT 100';
        const result = await db.instantQuery(query);
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('获取用户列表失败:', error);
        res.status(500).json({ success: false, message: '获取用户列表失败' });
    }
});

// --- 系统设置（需要权限） ---
app.get('/api/admin/settings', authMiddleware, requirePermission('system_settings'), (req, res) => {
    res.json({
        success: true,
        data: {
            jwtExpiry: '24h',
            maxLoginAttempts: 5,
            lockoutDuration: '30m',
            require2FA: false
        }
    });
});

// ==================== 其他业务接口 ====================

app.get('/api/shop/list', (req, res) => {
    res.json({ message: "电商接口开发中...", data: [] });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 茶海虾王后端服务已启动: http://localhost:${PORT}`);
    console.log(`🔗 接口文档: POST /api/auth/register`);
    console.log(`🔐 管理员接口: POST /api/admin/login`);
});
