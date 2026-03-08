// netlify/functions/save-to-db.js
const mysql = require('mysql2/promise');

exports.handler = async (event, context) => {
  // 仅允许 POST 请求
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // 1. 解析前端数据
    const data = JSON.parse(event.body);
    
    if (!data.name || !data.phone) {
      return { 
        statusCode: 400, 
        body: JSON.stringify({ error: '缺少必要字段 (name 或 phone)' }) 
      };
    }

    // 2. 获取环境变量配置
    const dbConfig = {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT || 3306,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    };

    // 检查环境变量
    if (!dbConfig.host || !dbConfig.user || !dbConfig.password || !dbConfig.database) {
      console.error('Missing database environment variables');
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: '服务器配置错误：缺少数据库环境变量' }) 
      };
    }

    // 3. 连接数据库
    const connection = await mysql.createConnection(dbConfig);

    // 🌟 新增功能：自动建表 (如果表不存在)
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `;
    
    await connection.execute(createTableSQL);
    console.log('Table check/creation completed.');

    // 4. 插入数据
    const insertSQL = `
      INSERT INTO requests (name, phone, message, created_at) 
      VALUES (?, ?, ?, NOW())
    `;
    
    const values = [
      data.name, 
      data.phone, 
      data.message || '', 
    ];

    await connection.execute(insertSQL, values);
    await connection.end();

    // 5. 返回成功
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        success: true, 
        message: '数据保存成功！(表已自动创建)' 
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