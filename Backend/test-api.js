/**
 * API测试脚本
 * 自动测试所有后端接口
 */

const http = require('http');

const BASE_URL = 'localhost';
const PORT = 3001;

// 测试数据
const testData = {
    email: 'test@example.com',
    phone: '13800138000',
    code: '123456'
};

// 发送HTTP请求的辅助函数
function makeRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: BASE_URL,
            port: PORT,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(responseData);
                    resolve({
                        statusCode: res.statusCode,
                        data: parsedData
                    });
                } catch (e) {
                    resolve({
                        statusCode: res.statusCode,
                        data: responseData
                    });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (data) {
            req.write(JSON.stringify(data));
        }

        req.end();
    });
}

// 测试函数
async function runTests() {
    console.log('🚀 开始API接口测试...\n');
    
    let passedTests = 0;
    let failedTests = 0;

    // 测试1: 发送邮箱验证码
    console.log('📧 测试1: 发送邮箱验证码');
    try {
        const response = await makeRequest('POST', '/api/auth/send-email', {
            email: testData.email
        });
        
        if (response.statusCode === 200 && response.data.success) {
            console.log('✅ 邮箱验证码发送成功');
            console.log('📋 响应:', JSON.stringify(response.data, null, 2));
            testData.emailCode = response.data.code;
            passedTests++;
        } else {
            console.log('❌ 邮箱验证码发送失败');
            console.log('📋 响应:', JSON.stringify(response.data, null, 2));
            failedTests++;
        }
    } catch (error) {
        console.log('❌ 邮箱验证码测试失败:', error.message);
        failedTests++;
    }
    console.log('');

    // 测试2: 发送短信验证码
    console.log('📱 测试2: 发送短信验证码');
    try {
        const response = await makeRequest('POST', '/api/auth/send-sms', {
            phone: testData.phone
        });
        
        if (response.statusCode === 200 && response.data.success) {
            console.log('✅ 短信验证码发送成功');
            console.log('📋 响应:', JSON.stringify(response.data, null, 2));
            testData.smsCode = response.data.code;
            passedTests++;
        } else {
            console.log('❌ 短信验证码发送失败');
            console.log('📋 响应:', JSON.stringify(response.data, null, 2));
            failedTests++;
        }
    } catch (error) {
        console.log('❌ 短信验证码测试失败:', error.message);
        failedTests++;
    }
    console.log('');

    // 测试3: 邮箱注册/登录
    console.log('🔐 测试3: 邮箱注册/登录');
    try {
        const response = await makeRequest('POST', '/api/auth/register', {
            type: 'email',
            identifier: testData.email,
            code: testData.emailCode || '888888',
            source_platform: 'email'
        });
        
        if (response.statusCode === 200 && response.data.success) {
            console.log('✅ 邮箱注册/登录成功');
            console.log('📋 响应:', JSON.stringify(response.data, null, 2));
            testData.token = response.data.data.token;
            testData.userId = response.data.data.user_id;
            passedTests++;
        } else {
            console.log('❌ 邮箱注册/登录失败');
            console.log('📋 响应:', JSON.stringify(response.data, null, 2));
            failedTests++;
        }
    } catch (error) {
        console.log('❌ 邮箱注册/登录测试失败:', error.message);
        failedTests++;
    }
    console.log('');

    // 测试4: 手机号注册/登录
    console.log('🔐 测试4: 手机号注册/登录');
    try {
        const response = await makeRequest('POST', '/api/auth/register', {
            type: 'phone',
            identifier: testData.phone,
            code: testData.smsCode || '888888',
            source_platform: 'phone'
        });
        
        if (response.statusCode === 200 && response.data.success) {
            console.log('✅ 手机号注册/登录成功');
            console.log('📋 响应:', JSON.stringify(response.data, null, 2));
            passedTests++;
        } else {
            console.log('❌ 手机号注册/登录失败');
            console.log('📋 响应:', JSON.stringify(response.data, null, 2));
            failedTests++;
        }
    } catch (error) {
        console.log('❌ 手机号注册/登录测试失败:', error.message);
        failedTests++;
    }
    console.log('');

    // 测试5: 社交登录
    console.log('🔐 测试5: 社交登录');
    try {
        const response = await makeRequest('POST', '/api/auth/social', {
            platform: 'wechat',
            code: 'test_auth_code'
        });
        
        if (response.statusCode === 200 && response.data.success) {
            console.log('✅ 社交登录成功');
            console.log('📋 响应:', JSON.stringify(response.data, null, 2));
            passedTests++;
        } else {
            console.log('❌ 社交登录失败');
            console.log('📋 响应:', JSON.stringify(response.data, null, 2));
            failedTests++;
        }
    } catch (error) {
        console.log('❌ 社交登录测试失败:', error.message);
        failedTests++;
    }
    console.log('');

    // 测试6: 错误处理 - 无效邮箱格式
    console.log('🚫 测试6: 错误处理 - 无效邮箱格式');
    try {
        const response = await makeRequest('POST', '/api/auth/send-email', {
            email: 'invalid-email'
        });
        
        if (response.statusCode === 400) {
            console.log('✅ 错误处理正确 - 返回400状态码');
            console.log('📋 响应:', JSON.stringify(response.data, null, 2));
            passedTests++;
        } else {
            console.log('❌ 错误处理不正确');
            console.log('📋 响应:', JSON.stringify(response.data, null, 2));
            failedTests++;
        }
    } catch (error) {
        console.log('❌ 错误处理测试失败:', error.message);
        failedTests++;
    }
    console.log('');

    // 测试7: 错误处理 - 无效手机号格式
    console.log('🚫 测试7: 错误处理 - 无效手机号格式');
    try {
        const response = await makeRequest('POST', '/api/auth/send-sms', {
            phone: '12345678901'
        });
        
        if (response.statusCode === 400) {
            console.log('✅ 错误处理正确 - 返回400状态码');
            console.log('📋 响应:', JSON.stringify(response.data, null, 2));
            passedTests++;
        } else {
            console.log('❌ 错误处理不正确');
            console.log('📋 响应:', JSON.stringify(response.data, null, 2));
            failedTests++;
        }
    } catch (error) {
        console.log('❌ 错误处理测试失败:', error.message);
        failedTests++;
    }
    console.log('');

    // 测试8: 错误处理 - 无效验证码
    console.log('🚫 测试8: 错误处理 - 无效验证码');
    try {
        const response = await makeRequest('POST', '/api/auth/register', {
            type: 'email',
            identifier: 'test2@example.com',
            code: '000000',  // 错误验证码
            source_platform: 'email'
        });
        
        if (response.statusCode === 401) {
            console.log('✅ 错误处理正确 - 返回401状态码');
            console.log('📋 响应:', JSON.stringify(response.data, null, 2));
            passedTests++;
        } else {
            console.log('❌ 错误处理不正确');
            console.log('📋 响应:', JSON.stringify(response.data, null, 2));
            failedTests++;
        }
    } catch (error) {
        console.log('❌ 错误处理测试失败:', error.message);
        failedTests++;
    }
    console.log('');

    // 打印测试总结
    console.log('═══════════════════════════════════════════');
    console.log('📊 测试总结');
    console.log('═══════════════════════════════════════════');
    console.log(`✅ 通过测试: ${passedTests}`);
    console.log(`❌ 失败测试: ${failedTests}`);
    console.log(`📈 通过率: ${Math.round((passedTests / (passedTests + failedTests)) * 100)}%`);
    console.log('═══════════════════════════════════════════');

    return { passedTests, failedTests };
}

// 检查服务是否运行
function checkService() {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: BASE_URL,
            port: PORT,
            path: '/',
            method: 'GET',
            timeout: 3000
        }, (res) => {
            resolve(true);
        });

        req.on('error', () => {
            resolve(false);
        });

        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });

        req.end();
    });
}

// 主函数
async function main() {
    console.log('🔍 检查后端服务状态...');
    
    const isRunning = await checkService();
    
    if (!isRunning) {
        console.log('❌ 后端服务未运行，请先启动服务：npm start');
        console.log('');
        console.log('💡 提示：在另一个终端窗口运行：');
        console.log('   cd Backend');
        console.log('   npm start');
        process.exit(1);
    }
    
    console.log('✅ 后端服务运行正常\n');
    
    // 运行测试
    const results = await runTests();
    
    // 根据测试结果退出
    process.exit(results.failedTests > 0 ? 1 : 0);
}

// 运行主函数
main().catch(error => {
    console.error('❌ 测试运行失败:', error);
    process.exit(1);
});