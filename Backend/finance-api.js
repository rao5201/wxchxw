const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const dayjs = require('dayjs');

const app = express();
app.use(cors());
app.use(express.json());

// 数据文件路径
const FINANCE_DATA_FILE = path.join(__dirname, 'data', 'finance', 'transactions.json');
const FINANCE_CONFIG_FILE = path.join(__dirname, 'data', 'finance', 'config.json');
const FINANCE_BACKUP_DIR = path.join(__dirname, 'data', 'finance', 'backups');

// 确保数据目录存在
const financeDir = path.join(__dirname, 'data', 'finance');
if (!fs.existsSync(financeDir)) {
    fs.mkdirSync(financeDir, { recursive: true });
}

if (!fs.existsSync(FINANCE_BACKUP_DIR)) {
    fs.mkdirSync(FINANCE_BACKUP_DIR, { recursive: true });
}

// 确保数据文件存在
if (!fs.existsSync(FINANCE_DATA_FILE)) {
    fs.writeFileSync(FINANCE_DATA_FILE, JSON.stringify([]));
}

if (!fs.existsSync(FINANCE_CONFIG_FILE)) {
    const defaultConfig = {
        dataRetentionDays: 10950, // 30年
        lastCleanup: new Date().toISOString(),
        paymentMethods: [
            { id: 'bank', name: '银行卡', enabled: true },
            { id: 'wechat', name: '微信支付', enabled: true },
            { id: 'alipay', name: '支付宝', enabled: true },
            { id: 'digital', name: '数字人民币', enabled: true },
            { id: 'creditcard', name: '信用卡', enabled: true }
        ],
        largeAmountThreshold: 50000, // 大额交易阈值（元）
        backupInterval: 7 // 备份间隔（天）
    };
    fs.writeFileSync(FINANCE_CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
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

// 清理过期数据（按会计法规定30年）
const cleanupExpiredFinanceData = () => {
    try {
        const config = JSON.parse(fs.readFileSync(FINANCE_CONFIG_FILE, 'utf8'));
        const transactions = JSON.parse(fs.readFileSync(FINANCE_DATA_FILE, 'utf8'));
        const now = new Date();
        
        // 清理超过30年的数据
        const retentionDate = new Date(now.getTime() - config.dataRetentionDays * 24 * 60 * 60 * 1000);
        const filteredTransactions = transactions.filter(tx => {
            const txDate = new Date(tx.timestamp);
            return txDate > retentionDate;
        });
        
        if (filteredTransactions.length !== transactions.length) {
            fs.writeFileSync(FINANCE_DATA_FILE, JSON.stringify(filteredTransactions, null, 2));
            console.log(`清理了 ${transactions.length - filteredTransactions.length} 条过期财务数据`);
        }
        
        // 更新最后清理时间
        config.lastCleanup = now.toISOString();
        fs.writeFileSync(FINANCE_CONFIG_FILE, JSON.stringify(config, null, 2));
        
    } catch (error) {
        console.error('清理过期财务数据失败:', error);
    }
};

// 自动备份财务数据
const backupFinanceData = () => {
    try {
        const transactions = JSON.parse(fs.readFileSync(FINANCE_DATA_FILE, 'utf8'));
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(FINANCE_BACKUP_DIR, `finance_backup_${timestamp}.json`);
        
        fs.writeFileSync(backupFile, JSON.stringify(transactions, null, 2));
        console.log(`财务数据备份成功: ${backupFile}`);
        
    } catch (error) {
        console.error('备份财务数据失败:', error);
    }
};

// 每天清理一次过期数据
setInterval(cleanupExpiredFinanceData, 24 * 60 * 60 * 1000);

// 每周备份一次财务数据
setInterval(backupFinanceData, 7 * 24 * 60 * 60 * 1000);

// ==================== API路由 ====================

// 1. 获取财务配置
app.get('/api/finance/config', authMiddleware, (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(FINANCE_CONFIG_FILE, 'utf8'));
        res.json({
            success: true,
            data: config
        });
    } catch (error) {
        console.error('获取财务配置失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '获取财务配置失败', 
            details: error.message 
        });
    }
});

// 2. 创建交易记录
app.post('/api/finance/transactions', authMiddleware, requirePermission('view_data'), (req, res) => {
    try {
        const data = req.body;
        
        // 验证必填字段
        if (!data.amount || !data.method || !data.type) {
            return res.status(400).json({ 
                success: false, 
                message: '缺少必要字段 (amount, method, type)' 
            });
        }
        
        // 读取现有数据
        const transactions = JSON.parse(fs.readFileSync(FINANCE_DATA_FILE, 'utf8'));
        const config = JSON.parse(fs.readFileSync(FINANCE_CONFIG_FILE, 'utf8'));
        
        // 创建新交易记录
        const newTransaction = {
            id: 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            amount: data.amount,
            method: data.method, // bank, wechat, alipay, digital, creditcard
            type: data.type, // income, expense
            description: data.description || '',
            transactionId: data.transactionId || '',
            timestamp: new Date().toISOString(),
            expiryDate: new Date(Date.now() + config.dataRetentionDays * 24 * 60 * 60 * 1000).toISOString(),
            isLargeAmount: data.amount >= config.largeAmountThreshold,
            createdBy: req.user.username
        };
        
        transactions.push(newTransaction);
        
        // 保存数据
        fs.writeFileSync(FINANCE_DATA_FILE, JSON.stringify(transactions, null, 2));
        
        console.log('创建交易记录:', newTransaction);
        
        res.json({
            success: true,
            message: '交易记录创建成功',
            data: newTransaction
        });
        
    } catch (error) {
        console.error('创建交易记录失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '创建交易记录失败', 
            details: error.message 
        });
    }
});

// 3. 获取交易记录列表
app.get('/api/finance/transactions', authMiddleware, requirePermission('view_data'), (req, res) => {
    try {
        const transactions = JSON.parse(fs.readFileSync(FINANCE_DATA_FILE, 'utf8'));
        const { page = 1, limit = 20, type, method, startDate, endDate } = req.query;
        
        // 过滤数据
        let filteredTransactions = transactions;
        
        if (type) {
            filteredTransactions = filteredTransactions.filter(tx => tx.type === type);
        }
        
        if (method) {
            filteredTransactions = filteredTransactions.filter(tx => tx.method === method);
        }
        
        if (startDate) {
            filteredTransactions = filteredTransactions.filter(tx => new Date(tx.timestamp) >= new Date(startDate));
        }
        
        if (endDate) {
            filteredTransactions = filteredTransactions.filter(tx => new Date(tx.timestamp) <= new Date(endDate));
        }
        
        // 按时间倒序排列
        filteredTransactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // 分页
        const total = filteredTransactions.length;
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        const paginatedTransactions = filteredTransactions.slice(startIndex, endIndex);
        
        res.json({
            success: true,
            data: {
                transactions: paginatedTransactions,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(total / limit)
                }
            }
        });
        
    } catch (error) {
        console.error('获取交易记录失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '获取交易记录失败', 
            details: error.message 
        });
    }
});

// 4. 获取交易记录详情
app.get('/api/finance/transactions/:id', authMiddleware, requirePermission('view_data'), (req, res) => {
    try {
        const { id } = req.params;
        const transactions = JSON.parse(fs.readFileSync(FINANCE_DATA_FILE, 'utf8'));
        const transaction = transactions.find(tx => tx.id === id);
        
        if (!transaction) {
            return res.status(404).json({ 
                success: false, 
                message: '交易记录不存在' 
            });
        }
        
        res.json({
            success: true,
            data: transaction
        });
        
    } catch (error) {
        console.error('获取交易记录详情失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '获取交易记录详情失败', 
            details: error.message 
        });
    }
});

// 5. 获取财务统计
app.get('/api/finance/stats', authMiddleware, requirePermission('view_data'), (req, res) => {
    try {
        const transactions = JSON.parse(fs.readFileSync(FINANCE_DATA_FILE, 'utf8'));
        const config = JSON.parse(fs.readFileSync(FINANCE_CONFIG_FILE, 'utf8'));
        
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const yearStart = new Date(now.getFullYear(), 0, 1);
        
        // 统计数据
        const stats = {
            totalIncome: transactions
                .filter(tx => tx.type === 'income')
                .reduce((sum, tx) => sum + tx.amount, 0),
            totalExpense: transactions
                .filter(tx => tx.type === 'expense')
                .reduce((sum, tx) => sum + tx.amount, 0),
            todayIncome: transactions
                .filter(tx => tx.type === 'income' && new Date(tx.timestamp) >= today)
                .reduce((sum, tx) => sum + tx.amount, 0),
            todayExpense: transactions
                .filter(tx => tx.type === 'expense' && new Date(tx.timestamp) >= today)
                .reduce((sum, tx) => sum + tx.amount, 0),
            monthIncome: transactions
                .filter(tx => tx.type === 'income' && new Date(tx.timestamp) >= monthStart)
                .reduce((sum, tx) => sum + tx.amount, 0),
            monthExpense: transactions
                .filter(tx => tx.type === 'expense' && new Date(tx.timestamp) >= monthStart)
                .reduce((sum, tx) => sum + tx.amount, 0),
            yearIncome: transactions
                .filter(tx => tx.type === 'income' && new Date(tx.timestamp) >= yearStart)
                .reduce((sum, tx) => sum + tx.amount, 0),
            yearExpense: transactions
                .filter(tx => tx.type === 'expense' && new Date(tx.timestamp) >= yearStart)
                .reduce((sum, tx) => sum + tx.amount, 0),
            largeTransactions: transactions.filter(tx => tx.isLargeAmount).length,
            totalTransactions: transactions.length,
            dataRetentionDays: config.dataRetentionDays
        };
        
        res.json({
            success: true,
            data: stats
        });
        
    } catch (error) {
        console.error('获取财务统计失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '获取财务统计失败', 
            details: error.message 
        });
    }
});

// 6. 获取备份列表
app.get('/api/finance/backups', authMiddleware, requirePermission('delete_data'), (req, res) => {
    try {
        if (!fs.existsSync(FINANCE_BACKUP_DIR)) {
            return res.json({
                success: true,
                data: []
            });
        }
        
        // 读取备份文件
        const backupFiles = fs.readdirSync(FINANCE_BACKUP_DIR)
            .filter(file => file.endsWith('.json'))
            .map(file => {
                const filePath = path.join(FINANCE_BACKUP_DIR, file);
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

// 7. 手动创建备份
app.post('/api/finance/backup', authMiddleware, requirePermission('delete_data'), (req, res) => {
    try {
        backupFinanceData();
        res.json({
            success: true,
            message: '财务数据备份成功'
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

const PORT = process.env.FINANCE_PORT || 3003;
app.listen(PORT, () => {
    console.log(`🚀 财务管理API服务器已启动: http://localhost:${PORT}`);
    console.log(`📊 交易记录接口: POST http://localhost:${PORT}/api/finance/transactions`);
    console.log(`📋 财务统计接口: GET http://localhost:${PORT}/api/finance/stats`);
});
