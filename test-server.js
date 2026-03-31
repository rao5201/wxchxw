const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// 存储表单数据的文件
const DATA_FILE = path.join(__dirname, 'form-data.json');

// 确保数据文件存在
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([]));
}

// 处理表单提交
app.post('/api/requests', (req, res) => {
    try {
        const data = req.body;
        
        if (!data.name || !data.phone) {
            return res.status(400).json({ success: false, message: '缺少必要字段 (name 或 phone)' });
        }
        
        // 读取现有数据
        const existingData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        
        // 添加新数据
        const newEntry = {
            ...data,
            timestamp: new Date().toISOString()
        };
        existingData.push(newEntry);
        
        // 保存数据
        fs.writeFileSync(DATA_FILE, JSON.stringify(existingData, null, 2));
        
        console.log('收到表单数据:', newEntry);
        console.log('数据已保存到:', DATA_FILE);
        
        res.json({
            success: true,
            message: '数据保存成功！'
        });
    } catch (error) {
        console.error('表单提交失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '服务器内部错误', 
            details: error.message 
        });
    }
});

// 获取所有表单数据
app.get('/api/requests', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        res.json({
            success: true,
            data: data
        });
    } catch (error) {
        console.error('获取数据失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '服务器内部错误', 
            details: error.message 
        });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`测试服务器已启动: http://localhost:${PORT}`);
    console.log(`表单提交接口: POST http://localhost:${PORT}/api/requests`);
    console.log(`数据获取接口: GET http://localhost:${PORT}/api/requests`);
});
