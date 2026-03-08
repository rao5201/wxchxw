// netlify/functions/save-to-db.js
// 安装依赖: npm install mysql2 express-validator
const mysql = require('mysql2/promise');
const { body, validationResult } = require('express-validator');

// ===================== 配置项（可通过环境变量覆盖） =====================
const CONFIG = {
  // 允许的数据库表名白名单（防止表名注入）
  ALLOWED_TABLES: process.env.ALLOWED_TABLES?.split(',') || ['contacts'],
  // 允许的跨域域名（生产环境替换为你的实际域名）
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS?.split(',') || ['https://your-domain.com', 'http://localhost:3000'],
  // 数据库连接超时时间（毫秒）
  DB_CONNECT_TIMEOUT: 5000,
  // 表单字段长度限制
  FIELD_LIMITS: {
    name: 50,
    message: 500
  }
};

// ===================== 数据校验规则 =====================
const validateForm = [
  body('name')
    .trim()
    .notEmpty().withMessage('姓名不能为空')
    .isLength({ max: CONFIG.FIELD_LIMITS.name }).withMessage(`姓名长度不能超过${CONFIG.FIELD_LIMITS.name}字符`),
  body('phone')
    .trim()
    .notEmpty().withMessage('手机号不能为空')
    .matches(/^1[3-9]\d{9}$/).withMessage('手机号格式错误，请输入11位有效手机号'),
  body('type')
    .trim()
    .notEmpty().withMessage('需求类型不能为空'),
  body('message')
    .trim()
    .isLength({ max: CONFIG.FIELD_LIMITS.message }).withMessage(`留言内容不能超过${CONFIG.FIELD_LIMITS.message}字符`)
];

// ===================== 工具函数 =====================
/**
 * 脱敏处理敏感数据（仅日志/返回用）
 * @param {Object} data - 原始表单数据
 * @returns {Object} 脱敏后的数据
 */
const maskSensitiveData = (data) => {
  return {
    ...data,
    phone: data.phone ? data.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : ''
  };
};

/**
 * 获取允许的跨域域名
 * @param {string} requestOrigin - 请求头中的origin
 * @returns {string} 允许的origin
 */
const getAllowOrigin = (requestOrigin) => {
  if (CONFIG.ALLOWED_ORIGINS.includes(requestOrigin)) {
    return requestOrigin;
  }
  // 开发环境允许localhost，生产环境返回第一个合法域名
  return requestOrigin?.includes('localhost') ? requestOrigin : CONFIG.ALLOWED_ORIGINS[0];
};

// ===================== 主处理函数 =====================
exports.handler = async (event, context) => {
  // 1. 处理OPTIONS预检请求（解决跨域）
  if (event.httpMethod === "OPTIONS") {
    const allowOrigin = getAllowOrigin(event.headers.origin);
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400' // 预检缓存24小时
      },
      body: ''
    };
  }

  // 2. 仅允许POST请求
  if (event.httpMethod !== "POST") {
    const allowOrigin = getAllowOrigin(event.headers.origin);
    return { 
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': allowOrigin
      },
      body: JSON.stringify({ 
        success: false, 
        message: "仅支持POST请求" 
      }) 
    };
  }

  try {
    // 3. 解析请求数据
    let rawData = {};
    try {
      rawData = JSON.parse(event.body || '{}');
    } catch (parseError) {
      const allowOrigin = getAllowOrigin(event.headers.origin);
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': allowOrigin
        },
        body: JSON.stringify({
          success: false,
          message: "请求数据格式错误，请提交合法的JSON数据"
        })
      };
    }

    // 4. 执行表单校验
    const validationPromises = validateForm.map(rule => rule.run({ body: rawData }));
    await Promise.all(validationPromises);
    const errors = validationResult({ body: rawData });
    
    if (!errors.isEmpty()) {
      const allowOrigin = getAllowOrigin(event.headers.origin);
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': allowOrigin
        },
        body: JSON.stringify({ 
          success: false, 
          message: "表单验证失败", 
          errors: errors.array().map(e => ({ field: e.path, msg: e.msg })) 
        })
      };
    }

    // 5. 读取并验证环境变量
    const {
      DB_HOST,
      DB_USER,
      DB_PASSWORD,
      DB_NAME,
      DB_TABLE = 'contacts',
      DB_ENCRYPT_KEY
    } = process.env;

    // 检查核心配置
    const missingConfig = [];
    if (!DB_HOST) missingConfig.push('DB_HOST');
    if (!DB_USER) missingConfig.push('DB_USER');
    if (!DB_PASSWORD) missingConfig.push('DB_PASSWORD');
    if (!DB_NAME) missingConfig.push('DB_NAME');
    if (!DB_ENCRYPT_KEY) missingConfig.push('DB_ENCRYPT_KEY');

    if (missingConfig.length > 0) {
      const allowOrigin = getAllowOrigin(event.headers.origin);
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': allowOrigin
        },
        body: JSON.stringify({ 
          success: false, 
          error: `缺少必要的环境变量：${missingConfig.join(', ')}` 
        })
      };
    }

    // 验证表名是否在白名单中
    if (!CONFIG.ALLOWED_TABLES.includes(DB_TABLE)) {
      const allowOrigin = getAllowOrigin(event.headers.origin);
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': allowOrigin
        },
        body: JSON.stringify({ 
          success: false, 
          message: "非法的数据库表名" 
        })
      };
    }

    // 6. 创建数据库连接
    let connection;
    try {
      connection = await mysql.createConnection({
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME,
        connectTimeout: CONFIG.DB_CONNECT_TIMEOUT,
        charset: 'utf8mb4', // 支持emoji和特殊字符
        multipleStatements: false // 禁止多语句执行，防止注入
      });
    } catch (connError) {
      console.error("数据库连接失败:", connError);
      const allowOrigin = getAllowOrigin(event.headers.origin);
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': allowOrigin
        },
        body: JSON.stringify({ 
          success: false, 
          message: "数据库连接失败，请稍后重试" 
        })
      };
    }

    // 7. 执行数据插入（参数化查询防注入）
    const sql = `
      INSERT INTO ${DB_TABLE} 
      (name, phone, type, message, ip_address, created_at) 
      VALUES (?, AES_ENCRYPT(?, ?), ?, ?, ?, NOW())
    `;
    
    const clientIp = event.headers['x-nf-client-connection-ip'] || 
                     event.headers['x-forwarded-for'] || 
                     'unknown';
                     
    const values = [
      rawData.name.trim(),
      rawData.phone.trim(),
      DB_ENCRYPT_KEY,
      rawData.type.trim(),
      rawData.message.trim(),
      clientIp
    ];

    await connection.execute(sql, values);
    await connection.end(); // 关闭连接

    // 8. 返回成功响应（脱敏数据）
    const maskedData = maskSensitiveData(rawData);
    console.log('表单数据入库成功:', maskedData);
    const allowOrigin = getAllowOrigin(event.headers.origin);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': allowOrigin
      },
      body: JSON.stringify({ 
        success: true, 
        message: "表单提交成功，我们会尽快与您联系", 
        data: maskedData 
      })
    };

  } catch (error) {
    // 全局错误处理（生产环境隐藏具体错误）
    console.error("表单处理失败:", error);
    const allowOrigin = getAllowOrigin(event.headers.origin);
    const errorMsg = process.env.NODE_ENV === 'production' 
      ? '服务器内部错误，请稍后重试' 
      : error.message;

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': allowOrigin
      },
      body: JSON.stringify({ 
        success: false, 
        message: errorMsg 
      })
    };
  }
};
