const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const schedule = require('node-schedule');
const { createObjectCsvWriter } = require('csv-writer');
const dayjs = require('dayjs');

const app = express();
app.use(cors());
app.use(express.json());

// 数据文件路径
const DATA_FILE = path.join(__dirname, 'data', 'requests.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const CONFIG_FILE = path.join(__dirname, 'data', 'config.json');

// 确保数据目录存在
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// 确保数据文件存在
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([]));
}

if (!fs.existsSync(USERS_FILE)) {
    // 创建默认客服账号
    const defaultUsers = [
        {
            id: 'admin_001',
            username: 'admin',
            password: bcrypt.hashSync('admin123', 10),
            role: 'admin',
            permissions: ['view_all', 'delete_data'],
            createdAt: new Date().toISOString()
        },
        {
            id: 'service_001',
            username: 'service',
            password: bcrypt.hashSync('service123', 10),
            role: 'service',
            permissions: ['view_data'],
            viewExpiry: null,
            createdAt: new Date().toISOString()
        }
    ];
    fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
}

if (!fs.existsSync(CONFIG_FILE)) {
    const defaultConfig = {
        dataRetentionDays: 730, // 2年
        userDataRetentionDays: 30, // 30天
        serviceViewExpiryDays: 60, // 2个月
        lastCleanup: new Date().toISOString(),
        email: {
            host: 'smtp.126.com',
            port: 465,
            secure: true,
            user: 'rao5201@126.com',
            pass: 'your-email-password',
            to: 'rao5201@126.com',
            subject: '茶海虾王 - 当天登记资料汇总'
        }
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
}

// JWT密钥
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// 中间件：验证JWT令牌
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, message: '未提供认证令牌' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: '无效的认证令牌' });
    }
};

// 中间件：检查权限
const requirePermission = (permission) => {
    return (req, res, next) => {
        if (!req.user.permissions.includes(permission) && !req.user.permissions.includes('view_all')) {
            return res.status(403).json({ success: false, message: '没有权限执行此操作' });
        }
        next();
    };
};

// 清理过期数据
const cleanupExpiredData = () => {
    try {
        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        const requests = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        const now = new Date();
        
        // 清理超过2年的数据
        const retentionDate = new Date(now.getTime() - config.dataRetentionDays * 24 * 60 * 60 * 1000);
        const filteredRequests = requests.filter(req => {
            const reqDate = new Date(req.timestamp);
            return reqDate > retentionDate;
        });
        
        if (filteredRequests.length !== requests.length) {
            fs.writeFileSync(DATA_FILE, JSON.stringify(filteredRequests, null, 2));
            console.log(`清理了 ${requests.length - filteredRequests.length} 条过期数据`);
        }
        
        // 更新最后清理时间
        config.lastCleanup = now.toISOString();
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        
    } catch (error) {
        console.error('清理过期数据失败:', error);
    }
};

// 每天清理一次过期数据
setInterval(cleanupExpiredData, 24 * 60 * 60 * 1000);

// ==================== 邮件发送功能 ====================

// 创建邮件传输器
function createTransporter() {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return nodemailer.createTransporter({
        host: config.email.host,
        port: config.email.port,
        secure: config.email.secure,
        auth: {
            user: config.email.user,
            pass: config.email.pass
        }
    });
}

// 生成当天登记资料的CSV文件
async function generateDailyReport() {
    try {
        const requests = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        const today = dayjs().format('YYYY-MM-DD');
        const todayRequests = requests.filter(req => {
            return dayjs(req.timestamp).format('YYYY-MM-DD') === today;
        });
        
        if (todayRequests.length === 0) {
            console.log('当天没有登记数据，跳过邮件发送');
            return null;
        }
        
        // 创建CSV文件
        const csvDir = path.join(__dirname, 'data', 'reports');
        if (!fs.existsSync(csvDir)) {
            fs.mkdirSync(csvDir, { recursive: true });
        }
        
        const csvFile = path.join(csvDir, `report_${today}.csv`);
        
        const csvWriter = createObjectCsvWriter({
            path: csvFile,
            header: [
                { id: 'id', title: 'ID' },
                { id: 'type', title: '需求类型' },
                { id: 'name', title: '联系人' },
                { id: 'phone', title: '电话' },
                { id: 'message', title: '需求描述' },
                { id: 'timestamp', title: '提交时间' },
                { id: 'expiryDate', title: '过期时间' }
            ]
        });
        
        await csvWriter.writeRecords(todayRequests);
        console.log(`生成当天报告成功: ${csvFile}`);
        
        return { csvFile, count: todayRequests.length };
    } catch (error) {
        console.error('生成报告失败:', error);
        return null;
    }
}

// 发送邮件
async function sendDailyReport() {
    try {
        const report = await generateDailyReport();
        
        if (!report) {
            return;
        }
        
        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        const transporter = createTransporter();
        
        const today = dayjs().format('YYYY-MM-DD');
        
        const mailOptions = {
            from: config.email.user,
            to: config.email.to,
            subject: `${config.email.subject} - ${today}`,
            text: `您好，

附件是 ${today} 的登记资料汇总，共 ${report.count} 条记录。

请查收。

茶海虾王管理系统`,
            attachments: [
                {
                    filename: `report_${today}.csv`,
                    path: report.csvFile
                }
            ]
        };
        
        const info = await transporter.sendMail(mailOptions);
        console.log(`邮件发送成功: ${info.messageId}`);
        
    } catch (error) {
        console.error('发送邮件失败:', error);
    }
}

// 定时任务：每天23:59发送当天报告
schedule.scheduleJob('59 23 * * *', () => {
    console.log('执行每日报告发送任务...');
    sendDailyReport();
});

// 测试邮件发送
app.post('/api/admin/test-email', authMiddleware, requirePermission('delete_data'), async (req, res) => {
    try {
        await sendDailyReport();
        res.json({
            success: true,
            message: '测试邮件发送成功'
        });
    } catch (error) {
        console.error('测试邮件发送失败:', error);
        res.status(500).json({
            success: false,
            message: '测试邮件发送失败',
            details: error.message
        });
    }
});

// ==================== API路由 ====================

// 1. 接收表单数据
app.post('/api/submit-request', (req, res) => {
    try {
        const data = req.body;
        
        // 验证必填字段
        if (!data.name || !data.phone) {
            return res.status(400).json({ 
                success: false, 
                message: '缺少必要字段 (name 或 phone)' 
            });
        }
        
        // 读取现有数据
        const requests = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        
        // 创建新记录
        const newRequest = {
            id: 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            type: data.type || '',
            name: data.name,
            phone: data.phone,
            message: data.message || '',
            timestamp: new Date().toISOString(),
            expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30天后过期
            viewedBy: []
        };
        
        requests.push(newRequest);
        
        // 保存数据
        fs.writeFileSync(DATA_FILE, JSON.stringify(requests, null, 2));
        
        console.log('收到新表单提交:', newRequest);
        
        res.json({
            success: true,
            message: '数据保存成功！',
            data: {
                id: newRequest.id,
                expiryDate: newRequest.expiryDate
            }
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

// 2. 管理员登录
app.post('/api/admin/login', (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: '用户名和密码不能为空' 
            });
        }
        
        // 读取用户数据
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        const user = users.find(u => u.username === username);
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: '用户名或密码错误' 
            });
        }
        
        // 验证密码
        const isValidPassword = bcrypt.compareSync(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ 
                success: false, 
                message: '用户名或密码错误' 
            });
        }
        
        // 检查查看权限是否过期
        if (user.role === 'service' && user.viewExpiry) {
            const expiryDate = new Date(user.viewExpiry);
            if (expiryDate < new Date()) {
                return res.status(403).json({ 
                    success: false, 
                    message: '查看权限已过期，请联系管理员' 
                });
            }
        }
        
        // 生成JWT令牌
        const token = jwt.sign(
            { 
                id: user.id, 
                username: user.username, 
                role: user.role,
                permissions: user.permissions 
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        console.log(`用户登录成功: ${username}`);
        
        res.json({
            success: true,
            message: '登录成功',
            data: {
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    permissions: user.permissions
                }
            }
        });
        
    } catch (error) {
        console.error('登录失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '服务器内部错误', 
            details: error.message 
        });
    }
});

// 3. 获取所有请求数据（需要认证）
app.get('/api/admin/requests', authMiddleware, requirePermission('view_data'), (req, res) => {
    try {
        const requests = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        
        // 按时间倒序排列
        requests.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // 标记已查看
        requests.forEach(req => {
            if (!req.viewedBy.includes(req.user?.id)) {
                req.viewedBy.push(req.user.id);
            }
        });
        
        // 保存查看记录
        fs.writeFileSync(DATA_FILE, JSON.stringify(requests, null, 2));
        
        res.json({
            success: true,
            data: requests,
            config: {
                userDataRetentionDays: config.userDataRetentionDays,
                serviceViewExpiryDays: config.serviceViewExpiryDays
            }
        });
        
    } catch (error) {
        console.error('获取数据失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '获取数据失败', 
            details: error.message 
        });
    }
});

// 4. 获取统计数据（需要认证）
app.get('/api/admin/stats', authMiddleware, (req, res) => {
    try {
        const requests = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        const stats = {
            totalRequests: requests.length,
            todayRequests: requests.filter(r => new Date(r.timestamp) >= today).length,
            pendingRequests: requests.filter(r => !r.viewedBy || r.viewedBy.length === 0).length,
            expiredRequests: requests.filter(r => new Date(r.expiryDate) < now).length,
            dataRetentionDays: config.dataRetentionDays,
            lastCleanup: config.lastCleanup
        };
        
        res.json({
            success: true,
            data: stats
        });
        
    } catch (error) {
        console.error('获取统计数据失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '获取统计数据失败', 
            details: error.message 
        });
    }
});

// 5. 删除数据（仅管理员）
app.delete('/api/admin/requests/:id', authMiddleware, requirePermission('delete_data'), (req, res) => {
    try {
        const { id } = req.params;
        let requests = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        
        const initialLength = requests.length;
        requests = requests.filter(r => r.id !== id);
        
        if (requests.length === initialLength) {
            return res.status(404).json({ 
                success: false, 
                message: '未找到指定的数据' 
            });
        }
        
        fs.writeFileSync(DATA_FILE, JSON.stringify(requests, null, 2));
        
        console.log(`数据已删除: ${id}`);
        
        res.json({
            success: true,
            message: '数据删除成功'
        });
        
    } catch (error) {
        console.error('删除数据失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '删除数据失败', 
            details: error.message 
        });
    }
});

// 6. 获取配置信息
app.get('/api/config', (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        res.json({
            success: true,
            data: {
                userDataRetentionDays: config.userDataRetentionDays
            }
        });
    } catch (error) {
        console.error('获取配置失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '获取配置失败', 
            details: error.message 
        });
    }
});

// 7. 创建数据备份（仅管理员）
app.post('/api/admin/backup', authMiddleware, requirePermission('delete_data'), (req, res) => {
    try {
        const requests = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        const backupDir = path.join(__dirname, 'data', 'backups');
        
        // 确保备份目录存在
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        
        // 生成备份文件名
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(backupDir, `backup_${timestamp}.json`);
        
        // 保存备份
        fs.writeFileSync(backupFile, JSON.stringify(requests, null, 2));
        
        console.log(`数据备份成功: ${backupFile}`);
        
        res.json({
            success: true,
            message: '数据备份成功',
            data: {
                backupFile: path.basename(backupFile),
                timestamp: new Date().toISOString(),
                count: requests.length
            }
        });
        
    } catch (error) {
        console.error('创建备份失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '创建备份失败', 
            details: error.message 
        });
    }
});

// 8. 获取备份列表（仅管理员）
app.get('/api/admin/backups', authMiddleware, requirePermission('delete_data'), (req, res) => {
    try {
        const backupDir = path.join(__dirname, 'data', 'backups');
        
        if (!fs.existsSync(backupDir)) {
            return res.json({
                success: true,
                data: []
            });
        }
        
        // 读取备份文件
        const backupFiles = fs.readdirSync(backupDir)
            .filter(file => file.endsWith('.json'))
            .map(file => {
                const filePath = path.join(backupDir, file);
                const stats = fs.statSync(filePath);
                return {
                    filename: file,
                    size: stats.size,
                    createdAt: stats.birthtime.toISOString(),
                    path: file
                };
            })
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        res.json({
            success: true,
            data: backupFiles
        });
        
    } catch (error) {
        console.error('获取备份列表失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '获取备份列表失败', 
            details: error.message 
        });
    }
});

// 9. 恢复备份（仅管理员）
app.post('/api/admin/restore', authMiddleware, requirePermission('delete_data'), (req, res) => {
    try {
        const { filename } = req.body;
        
        if (!filename) {
            return res.status(400).json({ 
                success: false, 
                message: '请提供备份文件名' 
            });
        }
        
        const backupDir = path.join(__dirname, 'data', 'backups');
        const backupFile = path.join(backupDir, filename);
        
        if (!fs.existsSync(backupFile)) {
            return res.status(404).json({ 
                success: false, 
                message: '备份文件不存在' 
            });
        }
        
        // 读取备份数据
        const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
        
        // 保存到主数据文件
        fs.writeFileSync(DATA_FILE, JSON.stringify(backupData, null, 2));
        
        console.log(`数据恢复成功: ${filename}`);
        
        res.json({
            success: true,
            message: '数据恢复成功',
            data: {
                filename: filename,
                count: backupData.length
            }
        });
        
    } catch (error) {
        console.error('恢复备份失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '恢复备份失败', 
            details: error.message 
        });
    }
});

// 10. 删除备份（仅管理员）
app.delete('/api/admin/backups/:filename', authMiddleware, requirePermission('delete_data'), (req, res) => {
    try {
        const { filename } = req.params;
        const backupDir = path.join(__dirname, 'data', 'backups');
        const backupFile = path.join(backupDir, filename);
        
        if (!fs.existsSync(backupFile)) {
            return res.status(404).json({ 
                success: false, 
                message: '备份文件不存在' 
            });
        }
        
        // 删除备份文件
        fs.unlinkSync(backupFile);
        
        console.log(`备份已删除: ${filename}`);
        
        res.json({
            success: true,
            message: '备份删除成功'
        });
        
    } catch (error) {
        console.error('删除备份失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '删除备份失败', 
            details: error.message 
        });
    }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`🚀 API服务器已启动: http://localhost:${PORT}`);
    console.log(`📊 表单提交接口: POST http://localhost:${PORT}/api/submit-request`);
    console.log(`🔐 管理员登录接口: POST http://localhost:${PORT}/api/admin/login`);
    console.log(`📋 数据查看接口: GET http://localhost:${PORT}/api/admin/requests`);
    console.log('');
    console.log('默认账号:');
    console.log('  管理员: admin / admin123');
    console.log('  客服: service / service123');
});
