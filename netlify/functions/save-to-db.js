// netlify/functions/save-to-db.js
const mysql = require('mysql2/promise');

exports.handler = async (event, context) => {
  // 仅允许 POST 请求
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // 1. 解析前端提交的数据
    const data = JSON.parse(event.body);
    
    // 简单验证数据是否存在 (根据您的实际需求修改字段名)
    if (!data.name || !data.phone) {
      return { 
        statusCode: 400, 
        body: JSON.stringify({ error: '缺少必要字段 (name 或 phone)' }) 
      };
    }

    // 2. 从环境变量获取数据库配置 (关键！这里没有硬编码密码)
    const dbConfig = {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT || 3306, // 默认端口 3306
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    };

    // 检查环境变量是否缺失
    if (!dbConfig.host || !dbConfig.user || !dbConfig.password || !dbConfig.database) {
      console.error('Missing database environment variables');
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: '服务器配置错误：缺少数据库环境变量' }) 
      };
    }

    // 3. 连接数据库并插入数据
    const connection = await mysql.createConnection(dbConfig);

    // ⚠️ 注意：请根据您实际的数据库表名和字段名修改下面的 SQL
    // 假设表名是 'requests'，字段是 'name', 'phone', 'message', 'created_at'
    const sql = `
      INSERT INTO requests (name, phone, message, created_at) 
      VALUES (?, ?, ?, NOW())
    `;
    
    const values = [
      data.name, 
      data.phone, 
      data.message || '', // 如果没有 message 字段，默认为空字符串
    ];

    await connection.execute(sql, values);
    await connection.end();

    // 4. 返回成功响应
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' // 允许跨域，方便前端调用
      },
      body: JSON.stringify({ 
        success: true, 
        message: '数据保存成功！' 
      })
    };

  } catch (error) {
    console.error('Database error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: '服务器内部错误', 
        details: error.message 
      })
    };
  }
};