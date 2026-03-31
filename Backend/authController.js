// Backend/authController.js
const express = require('express');
const router = express.Router();

// ==========================
// 数据库模拟层 (实际生产请替换为 MySQL/Supabase)
// ==========================
// 注意：为了演示，这里用内存数组模拟数据库
let mockDatabase = [];
let ipRequestCount = new Map(); // 用于记录 IP 请求数量

// ==========================
// 核心逻辑：自动注册接口
// ==========================
router.post('/register', async (req, res) => {
    try {
        const { phone, email, union_id, platform_type, ip_address } = req.body;

        // --- 1. IP 限制逻辑 (对应你的要求：3个封禁) ---
        // 获取客户端真实 IP (兼容代理)
        const clientIp = ip_address || req.ip || req.connection.remoteAddress;
        const today = new Date().toDateString();
        const ipKey = `${clientIp}_${today}`;

        // 初始化计数
        if (!ipRequestCount.has(ipKey)) {
            ipRequestCount.set(ipKey, 0);
        }

        const currentCount = ipRequestCount.get(ipKey);
        if (currentCount >= 3) {
            return res.status(403).json({
                success: false,
                message: "🚫 IP 频率限制：同一 IP 一天内仅允许注册 3 个账号，请稍后再试或联系客服。"
            });
        }

        // --- 2. 固定验证码验证逻辑 (对应策略 1 & 2) ---
        // 假设我们的固定验证码是 888888
        const FIXED_CODE = "888888";
        const { verification_code } = req.body;

        // 如果用户提交了验证码，必须等于固定码
        if (verification_code && verification_code !== FIXED_CODE) {
            return res.status(400).json({
                success: false,
                message: "❌ 验证码错误，请输入固定验证码 888888"
            });
        }

        // --- 3. 自动注册/登录逻辑 (对应策略 3, 4, 5) ---
        let user = null;

        // 优先级 1: 通过 union_id (第三方唯一标识) 查找
        if (union_id) {
            user = mockDatabase.find(u => u.union_id === union_id);
        }

        // 优先级 2: 通过手机号查找
        if (!user && phone) {
            user = mockDatabase.find(u => u.phone === phone);
        }

        // 优先级 3: 通过邮箱查找
        if (!user && email) {
            user = mockDatabase.find(u => u.email === email);
        }

        if (user) {
            // --- 场景 A: 用户已存在 (自动登录) ---
            console.log(`[登录] 用户 ${user.username} 已存在，自动登录。`);
            return res.json({
                success: true,
                message: "🎉 登录成功！欢迎回来。",
                data: user
            });
        } else {
            // --- 场景 B: 用户不存在