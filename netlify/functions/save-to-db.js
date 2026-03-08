// netlify/functions/save-to-db.js
// 需要先安装依赖: npm install mysql2
const mysql = require('mysql2/promise');

exports.handler = async (event, context) => {
  // 只允许 POST 请求
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ success: false, message: "方法不允许" }) };
  }

  try {
    const data = JSON.parse(event.body);

    // 【重要】从环境变量读取数据库配置 (切勿硬编码在代码里!)
    // 您需要在 Netlify 后台 -> Site Settings -> Environment Variables 添加以下变量:
    // DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    // 执行插入操作 (假设表名为 contacts，字段为 name, phone, message, created_at)
    // 请根据您的实际数据库表结构修改下面的 SQL
    const sql = `INSERT INTO contacts (name, phone, type, message, created_at) VALUES (?, ?, ?, ?, NOW())`;
    const values = [data.name || '', data.phone || '', data.type || '', data.message || ''];

    await connection.execute(sql, values);
    await connection.end();

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: "数据入库成功" })
    };

  } catch (error) {
    console.error("Database Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: error.message })
    };
  }
};