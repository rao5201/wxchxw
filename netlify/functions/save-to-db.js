// netlify/functions/save-to-db.js
// 安装依赖: npm install mysql2 express-validator
const mysql = require('mysql2/promise');
const { body, validationResult } = require('express-validator');

// 数据校验规则（防XSS、格式错误）
const validateForm = [
  body('name').trim().notEmpty().withMessage('姓名不能为空').isLength({ max: 50 }).withMessage('姓名长度不能超过50字符'),
  body('phone').trim().notEmpty().withMessage('手机号不能为空').matches(/^1[3-9]\d{9}$/).withMessage('手机号格式错误'),
  body('type').trim().notEmpty().withMessage('需求类型不能为空'),
  body('message').trim().isLength({ max: 500 }).withMessage('留言内容不能超过500字符')
];

// 脱敏处理敏感数据（仅日志/返回用，存储仍加密）
const maskSensitiveData = (data) => {
  return {
    ...data,
    phone: data.phone ? data.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : ''
  };
};

exports.handler = async (event, context) => {
  // 1. 仅允许POST请求
  if (event.httpMethod !== "POST") {
    return { 
      statusCode: 405, 
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: false, message: "仅支持POST请求" }) 
    };
  }

  try {
    // 2. 解析并校验请求数据
    const rawData = JSON.parse(event.body || '{}');
    
    // 模拟express-validator校验（Netlify函数无req对象，手动执行）
    const validationPromises = validateForm.map(rule => rule.run({ body: rawData }));
    await Promise.all(validationPromises);
    const errors = validationResult({ body: rawData });
    
    if (!errors.isEmpty()) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ 
          success: false, 
          message: "表单验证失败", 
          errors: errors.array().map(e => ({ field: e.path, msg: e.msg })) 
        })
      };
    }

    // 3. 读取环境变量（防硬编码）
    const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_TABLE = 'contacts' } = process.env;
    if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ success: false, error: '数据库配置缺失，请检查Netlify环境变量' })
      };
    }

    // 4. 创建数据库连接（带超时+重试）
    const connection = await mysql.createConnection({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      connectTimeout: 5000, // 5秒连接超时
      charset: 'utf8mb4' // 支持emoji等特殊字符
    });

    // 5. 执行插入（参数化查询防SQL注入）
    const sql = `INSERT INTO ${DB_TABLE} (name, phone, type, message, created_at, ip_address) 
                 VALUES (?, AES_ENCRYPT(?, ?), ?, ?, NOW(), ?)`;
    // 加密密钥（需在Netlify添加环境变量 DB_ENCRYPT_KEY）
    const encryptKey = process.env.DB_ENCRYPT_KEY || 'default_secure_key_2026';
    // 获取客户端IP（Netlify函数特有）
    const clientIp = event.headers['x-nf-client-connection-ip'] || 'unknown';
    const values = [
      rawData.name.trim(),
      rawData.phone.trim(),
      encryptKey,
      rawData.type.trim(),
      rawData.message.trim(),
      clientIp
    ];

    await connection.execute(sql, values);
    await connection.end();

    // 6. 返回成功（脱敏数据，不泄露完整手机号）
    console.log('数据入库成功:', maskSensitiveData(rawData));
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ 
        success: true, 
        message: "表单提交成功", 
        data: maskSensitiveData(rawData) 
      })
    };

  } catch (error) {
    // 7. 错误处理（隐藏敏感错误信息）
    console.error("数据库操作失败:", error);
    const errorMsg = process.env.NODE_ENV === 'production' 
      ? '服务器内部错误，请稍后重试' 
      : error.message;
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ 
        success: false, 
        message: errorMsg 
      })
    };
  }
};
