-- 1. 创建数据库（如果还没创建）
CREATE DATABASE IF NOT EXISTS TeaKing_UserDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE TeaKing_UserDB;

-- 2. 创建“统一用户表”
-- 这张表是核心，兼容手机号、邮箱、以及N个第三方平台
CREATE TABLE IF NOT EXISTS Users (
    -- 主键：系统内部唯一标识
    user_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- 基础信息
    username VARCHAR(64) NOT NULL COMMENT '用户名/昵称',
    phone VARCHAR(20) DEFAULT NULL COMMENT '手机号',
    email VARCHAR(64) DEFAULT NULL COMMENT '邮箱',
    password_hash VARCHAR(255) DEFAULT NULL COMMENT '密码哈希值（可为空，第三方登录不需要）',
    
    -- 第三方平台核心标识
    -- 用于打通微信、支付宝、抖音等所有平台的唯一标识
    union_id VARCHAR(64) DEFAULT NULL COMMENT '全网统一UnionID',
    open_id_wechat VARCHAR(64) DEFAULT NULL COMMENT '微信OpenID',
    open_id_alipay VARCHAR(64) DEFAULT NULL COMMENT '支付宝UserID',
    open_id_douyin VARCHAR(64) DEFAULT NULL COMMENT '抖音OpenID',
    open_id_kuaishou VARCHAR(64) DEFAULT NULL COMMENT '快手OpenID',
    open_id_xiaohongshu VARCHAR(64) DEFAULT NULL COMMENT '小红书OpenID',
    open_id_taobao VARCHAR(64) DEFAULT NULL COMMENT '淘宝OpenID',
    open_id_pdd VARCHAR(64) DEFAULT NULL COMMENT '拼多多OpenID',
    open_id_jd VARCHAR(64) DEFAULT NULL COMMENT '京东OpenID',
    
    -- 账号状态与来源
    source_platform VARCHAR(32) DEFAULT 'Direct' COMMENT '注册来源：WeChat, Phone, Email等',
    is_active BOOLEAN DEFAULT TRUE COMMENT '账号是否激活',
    is_auto_generated BOOLEAN DEFAULT FALSE COMMENT '是否系统自动生成的账号',
    
    -- 时间戳
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '注册时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    
    -- 索引优化：提高查询速度
    UNIQUE INDEX idx_union_id (union_id), -- 防止UnionID重复
    UNIQUE INDEX idx_phone (phone),       -- 防止手机号重复
    UNIQUE INDEX idx_email (email),       -- 防止邮箱重复
    INDEX idx_open_id_wechat (open_id_wechat),
    INDEX idx_open_id_alipay (open_id_alipay)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='统一用户中心表';

-- 3. 创建“IP风控黑名单表”
-- 用于实现你要求的：超过3次注册封禁72小时
CREATE TABLE IF NOT EXISTS IP_Blacklist (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    ip_address VARCHAR(45) NOT NULL COMMENT 'IP地址',
    block_reason VARCHAR(255) DEFAULT 'Excessive Registration Attempts' COMMENT '封禁原因',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL COMMENT '解封时间',
    
    INDEX idx_ip (ip_address),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='IP黑名单管控表';