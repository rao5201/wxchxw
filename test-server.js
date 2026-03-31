const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3003;

// 模拟数据存储
let formData = [];
let financeData = [];

// 处理请求
const server = http.createServer((req, res) => {
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // 处理OPTIONS请求
    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
    }
    
    // 处理API请求
    if (req.url.startsWith('/api/')) {
        handleApiRequest(req, res);
        return;
    }
    
    // 处理静态文件
    if (req.url === '/') {
        req.url = '/index.html';
    }
    
    const filePath = path.join(__dirname, req.url);
    const extname = path.extname(filePath);
    
    let contentType = 'text/html';
    switch (extname) {
        case '.js':
            contentType = 'text/javascript';
            break;
        case '.css':
            contentType = 'text/css';
            break;
        case '.json':
            contentType = 'application/json';
            break;
        case '.png':
            contentType = 'image/png';
            break;
        case '.jpg':
            contentType = 'image/jpg';
            break;
    }
    
    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'text/html');
            res.end('<h1>404 Not Found</h1>');
        } else {
            res.statusCode = 200;
            res.setHeader('Content-Type', contentType);
            res.end(content, 'utf-8');
        }
    });
});

// 处理API请求
function handleApiRequest(req, res) {
    const url = req.url;
    const method = req.method;
    
    // 解析请求体
    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });
    
    req.on('end', () => {
        if (url === '/api/submit-request' && method === 'POST') {
            // 处理表单提交
            const data = JSON.parse(body);
            const newEntry = {
                id: 'req_' + Date.now(),
                ...data,
                timestamp: new Date().toISOString(),
                expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            };
            formData.push(newEntry);
            
            console.log('收到表单提交:', newEntry);
            
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
                success: true,
                message: '数据保存成功！',
                data: newEntry
            }));
            
        } else if (url === '/api/finance/transactions' && method === 'POST') {
            // 处理财务交易
            const data = JSON.parse(body);
            const newTransaction = {
                id: 'tx_' + Date.now(),
                ...data,
                timestamp: new Date().toISOString(),
                expiryDate: new Date(Date.now() + 10950 * 24 * 60 * 60 * 1000).toISOString(), // 30年
                isLargeAmount: data.amount >= 50000
            };
            financeData.push(newTransaction);
            
            console.log('收到交易记录:', newTransaction);
            
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
                success: true,
                message: '交易记录创建成功',
                data: newTransaction
            }));
            
        } else if (url === '/api/finance/stats' && method === 'GET') {
            // 处理财务统计
            const stats = {
                totalIncome: financeData
                    .filter(tx => tx.type === 'income')
                    .reduce((sum, tx) => sum + tx.amount, 0),
                totalExpense: financeData
                    .filter(tx => tx.type === 'expense')
                    .reduce((sum, tx) => sum + tx.amount, 0),
                todayIncome: financeData
                    .filter(tx => tx.type === 'income' && new Date(tx.timestamp).toDateString() === new Date().toDateString())
                    .reduce((sum, tx) => sum + tx.amount, 0),
                todayExpense: financeData
                    .filter(tx => tx.type === 'expense' && new Date(tx.timestamp).toDateString() === new Date().toDateString())
                    .reduce((sum, tx) => sum + tx.amount, 0),
                largeTransactions: financeData.filter(tx => tx.isLargeAmount).length,
                totalTransactions: financeData.length,
                dataRetentionDays: 10950
            };
            
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
                success: true,
                data: stats
            }));
            
        } else if (url === '/api/finance/transactions' && method === 'GET') {
            // 处理交易记录查询
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
                success: true,
                data: {
                    transactions: financeData.reverse(),
                    pagination: {
                        total: financeData.length,
                        page: 1,
                        limit: 20,
                        pages: Math.ceil(financeData.length / 20)
                    }
                }
            }));
            
        } else if (url === '/api/admin/requests' && method === 'GET') {
            // 处理后台数据查询
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
                success: true,
                data: formData.reverse(),
                config: {
                    userDataRetentionDays: 30,
                    serviceViewExpiryDays: 60
                }
            }));
            
        } else if (url === '/api/admin/stats' && method === 'GET') {
            // 处理后台统计
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
                success: true,
                data: {
                    totalRequests: formData.length,
                    todayRequests: formData.filter(r => new Date(r.timestamp).toDateString() === new Date().toDateString()).length,
                    pendingRequests: formData.length,
                    expiredRequests: 0,
                    dataRetentionDays: 730,
                    lastCleanup: new Date().toISOString()
                }
            }));
            
        } else if (url === '/api/admin/login' && method === 'POST') {
            // 处理登录
            const { username, password } = JSON.parse(body);
            
            if ((username === 'admin' && password === 'admin123') || (username === 'service' && password === 'service123')) {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                    success: true,
                    message: '登录成功',
                    data: {
                        token: 'test-token-' + Date.now(),
                        user: {
                            id: username === 'admin' ? 'admin_001' : 'service_001',
                            username: username,
                            role: username === 'admin' ? 'admin' : 'service',
                            permissions: username === 'admin' ? ['view_all', 'delete_data'] : ['view_data']
                        }
                    }
                }));
            } else {
                res.statusCode = 401;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                    success: false,
                    message: '用户名或密码错误'
                }));
            }
            
        } else {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
                success: false,
                message: '接口不存在'
            }));
        }
    });
}

// 启动服务器
server.listen(PORT, () => {
    console.log(`🚀 测试服务器已启动: http://localhost:${PORT}`);
    console.log(`📄 网站地址: http://localhost:${PORT}`);
    console.log(`🔐 后台管理: http://localhost:${PORT}/admin.html`);
    console.log('');
    console.log('默认账号:');
    console.log('  管理员: admin / admin123');
    console.log('  客服: service / service123');
    console.log('');
    console.log('测试功能:');
    console.log('1. 访问网站首页，测试表单提交');
    console.log('2. 访问后台管理，测试数据查看');
    console.log('3. 访问财务管理，测试交易记录');
});
