const express = require('express');
const path = require('path');
const db = require('../database');
const app = express();
const port = process.env.WEB_PORT || 3000;

// 设置模板引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 设置静态文件目录
app.use(express.static(path.join(__dirname, 'public')));

// 首页路由 - 显示所有群组列表
app.get('/', async (req, res) => {
    try {
        const chats = await db.getAllChats();
        
        // 获取每个群组的余额和汇率信息
        const chatsWithDetails = await Promise.all(chats.map(async (chat) => {
            const balance = await db.getBalance(chat.chat_id);
            const rate = await db.getExchangeRate(chat.chat_id);
            const feeRate = await db.getFeeRate(chat.chat_id);
            
            return {
                ...chat,
                balance,
                rate,
                feeRate
            };
        }));
        
        res.render('index', { chats: chatsWithDetails });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('服务器错误');
    }
});

// 群组详情页路由
app.get('/chat/:chatId', async (req, res) => {
    try {
        const chatId = parseInt(req.params.chatId);
        const date = req.query.date || new Date().toISOString().split('T')[0]; // 获取查询参数中的日期，默认为今天
        
        // 获取群组基本信息
        const chat = await db.getChat(chatId);
        if (!chat) {
            return res.status(404).send('群组不存在');
        }
        
        // 获取群组余额、汇率信息和总计统计
        const [balance, rate, feeRate, totalStats] = await Promise.all([
            db.getBalance(chatId),
            db.getExchangeRate(chatId),
            db.getFeeRate(chatId),
            db.getTotalStats(chatId)
        ]);
        
        console.log('🔍 [DEBUG] 总计统计数据:', totalStats);  // 添加调试日志
        
        // 获取指定日期的交易记录
        const [transactions, dailyStats] = await Promise.all([
            db.getTransactionsByDate(chatId, date),
            db.getDailyStats(chatId, date)
        ]);
        
        res.render('chat', {
            chat: {
                ...chat,
                balance,
                rate,
                feeRate,
                ...totalStats  // 添加总计统计数据
            },
            transactions,
            dailyStats,
            selectedDate: date
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('服务器错误');
    }
});

// 启动服务器，监听所有网络接口
app.listen(port, '0.0.0.0', () => {
    console.log(`Web服务器运行在 http://0.0.0.0:${port}`);
}); 