/**
 * 管理员认证模块
 * 提供管理员登录、权限验证、Token管理等功能
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// 管理员配置文件路径
const ADMIN_CONFIG_PATH = path.join(__dirname, 'config', 'admin.json');

// 内存中的管理员数据
let adminConfig = null;
let activeTokens = new Map(); // 存储活跃的Token
let loginAttempts = new Map(); // 存储登录尝试记录

/**
 * 加载管理员配置
 */
function loadAdminConfig() {
    try {
        if (fs.existsSync(ADMIN_CONFIG_PATH)) {
            const data = fs.readFileSync(ADMIN_CONFIG_PATH, 'utf8');
            adminConfig = JSON.parse(data);
            console.log('✅ 管理员配置加载成功');
        } else {
            // 创建默认配置
            adminConfig = createDefaultConfig();
            saveAdminConfig();
            console.log('✅ 创建默认管理员配置');
        }
    } catch (error) {
        console.error('❌ 加载管理员配置失败:', error);
        adminConfig = createDefaultConfig();
    }
}

/**
 * 创建默认配置
 */
function createDefaultConfig() {
    return {
        admins: [
            {
                id: 1,
                username: 'admin',
                password: hashPassword('admin123'), // 默认密码，首次登录后必须修改
                role: 'super_admin',
                created_at: new Date().toISOString(),
                last_login: null,
                is_active: true,
                permissions: [
                    'user_management',
                    'database_management',
                    'system_settings',
                    'logs_view',
                    'backup_management'
                ]
            }
        ],
        settings: {
            token_expiry: '24h',
            max_login_attempts: 5,
            lockout_duration: '30m',
            require_2fa: false
        }
    };
}

/**
 * 保存管理员配置
 */
function saveAdminConfig() {
    try {
        const configDir = path.dirname(ADMIN_CONFIG_PATH);
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        fs.writeFileSync(ADMIN_CONFIG_PATH, JSON.stringify(adminConfig, null, 2));
        return true;
    } catch (error) {
        console.error('❌ 保存管理员配置失败:', error);
        return false;
    }
}

/**
 * 密码加密
 */
function hashPassword(password) {
    return bcrypt.hashSync(password, 10);
}

/**
 * 验证密码
 */
function verifyPassword(password, hashedPassword) {
    return bcrypt.compareSync(password, hashedPassword);
}

/**
 * 生成Token
 */
function generateToken(admin) {
    const payload = {
        adminId: admin.id,
        username: admin.username,
        role: admin.role,
        permissions: admin.permissions,
        iat: Math.floor(Date.now() / 1000)
    };
    
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'teaking-secret-key-2026', {
        expiresIn: adminConfig.settings.token_expiry
    });
    
    // 存储活跃Token
    activeTokens.set(token, {
        adminId: admin.id,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24小时
    });
    
    return token;
}

/**
 * 验证Token
 */
function verifyToken(token) {
    try {
        // 检查Token是否在活跃列表中
        if (!activeTokens.has(token)) {
            return { valid: false, message: 'Token已失效' };
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'teaking-secret-key-2026');
        const tokenInfo = activeTokens.get(token);
        
        // 检查Token是否过期
        if (new Date() > tokenInfo.expiresAt) {
            activeTokens.delete(token);
            return { valid: false, message: 'Token已过期' };
        }
        
        // 获取管理员信息
        const admin = adminConfig.admins.find(a => a.id === decoded.adminId);
        if (!admin || !admin.is_active) {
            return { valid: false, message: '管理员账号不存在或已禁用' };
        }
        
        return {
            valid: true,
            admin: {
                id: admin.id,
                username: admin.username,
                role: admin.role,
                permissions: admin.permissions
            }
        };
    } catch (error) {
        return { valid: false, message: 'Token验证失败' };
    }
}

/**
 * 检查登录尝试次数
 */
function checkLoginAttempts(username) {
    const now = Date.now();
    const attempts = loginAttempts.get(username);
    
    if (!attempts) {
        return { allowed: true };
    }
    
    // 检查是否在锁定时间内
    if (attempts.count >= adminConfig.settings.max_login_attempts) {
        const lockoutTime = attempts.lastAttempt + parseDuration(adminConfig.settings.lockout_duration);
        if (now < lockoutTime) {
            const remainingTime = Math.ceil((lockoutTime - now) / 1000 / 60);
            return {
                allowed: false,
                message: `账号已锁定，请${remainingTime}分钟后重试`
            };
        } else {
            // 锁定时间已过，重置计数
            loginAttempts.delete(username);
            return { allowed: true };
        }
    }
    
    return { allowed: true };
}

/**
 * 记录登录尝试
 */
function recordLoginAttempt(username, success) {
    const now = Date.now();
    const attempts = loginAttempts.get(username) || { count: 0, lastAttempt: now };
    
    if (success) {
        // 登录成功，清除记录
        loginAttempts.delete(username);
    } else {
        // 登录失败，增加计数
        attempts.count += 1;
        attempts.lastAttempt = now;
        loginAttempts.set(username, attempts);
    }
}

/**
 * 解析持续时间字符串
 */
function parseDuration(duration) {
    const match = duration.match(/(\d+)([smhd])/);
    if (!match) return 30 * 60 * 1000; // 默认30分钟
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        default: return 30 * 60 * 1000;
    }
}

/**
 * 管理员登录
 */
async function adminLogin(username, password) {
    // 检查登录尝试次数
    const attemptCheck = checkLoginAttempts(username);
    if (!attemptCheck.allowed) {
        return { success: false, message: attemptCheck.message };
    }
    
    // 查找管理员
    const admin = adminConfig.admins.find(a => a.username === username && a.is_active);
    if (!admin) {
        recordLoginAttempt(username, false);
        return { success: false, message: '用户名或密码错误' };
    }
    
    // 验证密码
    if (!verifyPassword(password, admin.password)) {
        recordLoginAttempt(username, false);
        return { success: false, message: '用户名或密码错误' };
    }
    
    // 登录成功
    recordLoginAttempt(username, true);
    
    // 更新最后登录时间
    admin.last_login = new Date().toISOString();
    saveAdminConfig();
    
    // 生成Token
    const token = generateToken(admin);
    
    return {
        success: true,
        message: '登录成功',
        data: {
            token,
            admin: {
                id: admin.id,
                username: admin.username,
                role: admin.role,
                permissions: admin.permissions
            }
        }
    };
}

/**
 * 管理员登出
 */
function adminLogout(token) {
    if (activeTokens.has(token)) {
        activeTokens.delete(token);
        return { success: true, message: '登出成功' };
    }
    return { success: false, message: 'Token不存在' };
}

/**
 * 修改密码
 */
async function changePassword(adminId, oldPassword, newPassword) {
    const admin = adminConfig.admins.find(a => a.id === adminId);
    if (!admin) {
        return { success: false, message: '管理员不存在' };
    }
    
    // 验证旧密码
    if (!verifyPassword(oldPassword, admin.password)) {
        return { success: false, message: '原密码错误' };
    }
    
    // 更新密码
    admin.password = hashPassword(newPassword);
    saveAdminConfig();
    
    return { success: true, message: '密码修改成功' };
}

/**
 * 创建新管理员（仅超级管理员可操作）
 */
async function createAdmin(creatorToken, newAdminData) {
    // 验证创建者权限
    const verification = verifyToken(creatorToken);
    if (!verification.valid) {
        return { success: false, message: 'Token验证失败' };
    }
    
    if (verification.admin.role !== 'super_admin') {
        return { success: false, message: '权限不足' };
    }
    
    // 检查用户名是否已存在
    if (adminConfig.admins.some(a => a.username === newAdminData.username)) {
        return { success: false, message: '用户名已存在' };
    }
    
    // 创建新管理员
    const newAdmin = {
        id: adminConfig.admins.length + 1,
        username: newAdminData.username,
        password: hashPassword(newAdminData.password),
        role: newAdminData.role || 'admin',
        created_at: new Date().toISOString(),
        last_login: null,
        is_active: true,
        permissions: newAdminData.permissions || ['logs_view']
    };
    
    adminConfig.admins.push(newAdmin);
    saveAdminConfig();
    
    return {
        success: true,
        message: '管理员创建成功',
        data: {
            id: newAdmin.id,
            username: newAdmin.username,
            role: newAdmin.role
        }
    };
}

/**
 * 获取管理员列表（仅超级管理员可操作）
 */
function getAdminList(token) {
    const verification = verifyToken(token);
    if (!verification.valid) {
        return { success: false, message: 'Token验证失败' };
    }
    
    if (verification.admin.role !== 'super_admin') {
        return { success: false, message: '权限不足' };
    }
    
    const admins = adminConfig.admins.map(admin => ({
        id: admin.id,
        username: admin.username,
        role: admin.role,
        is_active: admin.is_active,
        created_at: admin.created_at,
        last_login: admin.last_login,
        permissions: admin.permissions
    }));
    
    return { success: true, data: admins };
}

/**
 * 认证中间件
 */
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: '未提供Token' });
    }
    
    const token = authHeader.substring(7);
    const verification = verifyToken(token);
    
    if (!verification.valid) {
        return res.status(401).json({ success: false, message: verification.message });
    }
    
    req.admin = verification.admin;
    req.token = token;
    next();
}

/**
 * 权限检查中间件
 */
function requirePermission(permission) {
    return (req, res, next) => {
        if (!req.admin || !req.admin.permissions.includes(permission)) {
            return res.status(403).json({ success: false, message: '权限不足' });
        }
        next();
    };
}

// 初始化配置
loadAdminConfig();

// 定期清理过期Token
setInterval(() => {
    const now = new Date();
    for (const [token, info] of activeTokens.entries()) {
        if (now > info.expiresAt) {
            activeTokens.delete(token);
        }
    }
}, 60 * 60 * 1000); // 每小时清理一次

module.exports = {
    adminLogin,
    adminLogout,
    changePassword,
    createAdmin,
    getAdminList,
    verifyToken,
    authMiddleware,
    requirePermission,
    hashPassword
};