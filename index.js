require('dotenv').config();
const { Telegraf } = require('telegraf');
const db = require('./database');
const axios = require('axios');
const math = require('mathjs');
const scheduler = require('./scheduler');

// 初始化 bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// 检查用户是否是机器人所有者
async function isBotOwner(userId) {
    try {
        return await db.isBotOwner(userId);
    } catch (error) {
        console.error('检查机器人所有者权限失败:', error);
        return false;
    }
}

// 检查用户是否是管理员
async function isAdmin(chatId, userId) {
    try {
        // 如果是机器人所有者，则拥有所有权限
        if (await isBotOwner(userId)) {
            return true;
        }
        const admins = await db.getAdmins(chatId);
        return admins.includes(userId);
    } catch (error) {
        console.error('检查管理员权限失败:', error);
        return false;
    }
}

// 检查记账功能是否开启
async function isAccountingEnabled(chatId) {
    try {
        return await db.isAccountingEnabled(chatId);
    } catch (error) {
        console.error('检查记账功能状态失败:', error);
        return false;
    }
}

// 修改权限检查中间件，增加记账功能状态检查
async function requireAdmin(ctx, next) {
    // 首先检查是否启用了记账功能
    if (!(await isAccountingEnabled(ctx.chat.id))) {
        await ctx.reply('⚠️ 记账功能未启用，请发送"开始"来启用记账功能');
        return;
    }

    if (await isAdmin(ctx.chat.id, ctx.from.id)) {
        return next();
    }
    await ctx.reply('⚠️ 抱歉，只有本群操作员才能使用此功能');
    return;
}

// 机器人所有者权限检查中间件
async function requireBotOwner(ctx, next) {
    if (await isBotOwner(ctx.from.id)) {
        return next();
    }
    await ctx.reply('⚠️ 抱歉，只有机器人所有者才能使用此功能');
    return;
}

// 启动消息
bot.command('start', async (ctx) => {
    const isEnabled = await isAccountingEnabled(ctx.chat.id);
    const statusMessage = isEnabled ? 
        '当前状态：记账功能已启用\n' :
        '当前状态：记账功能未启用，请发送"开始"来启用\n';

    ctx.reply(
        '👋 欢迎使用记账机器人！\n\n' +
        statusMessage + '\n' +
        '使用说明：\n' +
        '1. 设置汇率：设置汇率7.35\n' +
        '2. 记录收入：+100 或 +100/7.35\n' +
        '3. 记录支出：-100 或 -100/7.35\n' +
        '4. 查询余额：余额\n' +
        '5. 查询记录：汇总\n\n' +
        '注意：只有本群操作员可以使用记账功能\n' +
        '只有机器人所有者可以添加群组操作员'
    );
});

// 设置机器人所有者命令
bot.command('setowner', async (ctx) => {
    try {
        // 检查是否已经有所有者
        const firstOwner = await db.getFirstBotOwner();
        if (firstOwner) {
            const ownerName = await getBotOwnerInfo(ctx, firstOwner.user_id);
            return ctx.reply(
                '⚠️ 机器人已有所有者\n\n' +
                `第一所有者：${ownerName}\n` +
                `设置时间：${new Date(firstOwner.created_at).toLocaleString('zh-CN', {
                    timeZone: 'Asia/Shanghai',
                    hour12: false
                })}\n\n` +
                '如需添加其他所有者，请使用 /addowner 命令'
            );
        }

        await db.setBotOwner(ctx.from.id);
        ctx.reply(
            '✅ 您已成为机器人所有者\n\n' +
            '作为机器人所有者，您可以：\n' +
            '1. 在任何群组中使用机器人\n' +
            '2. 使用"添加操作员"命令添加群组操作员\n' +
            '3. 使用"移除操作员"命令移除群组操作员\n' +
            '4. 使用 /addowner 命令添加其他机器人所有者\n' +
            '5. 查看所有记账相关数据'
        );
    } catch (error) {
        console.error('设置机器人所有者失败:', error);
        ctx.reply('❌ 设置机器人所有者失败，请重试');
    }
});

// 添加新的所有者命令
bot.command('addowner', requireBotOwner, async (ctx) => {
    try {
        // 检查是否在私聊中
        if (ctx.chat.type !== 'private') {
            return ctx.reply('⚠️ 请在私聊中使用此命令');
        }

        // 获取命令参数（用户名）
        const args = ctx.message.text.split(' ');
        if (args.length !== 2) {
            return ctx.reply(
                '⚠️ 请使用正确的格式：/addowner @用户名\n' +
                '例如：/addowner @axpay88'
            );
        }

        let username = args[1];
        // 移除可能存在的 @ 符号
        username = username.replace('@', '');

        try {
            // 使用 getChat 前确保用户名格式正确
            const formattedUsername = username.startsWith('@') ? username : '@' + username;
            
            // 尝试获取用户信息
            let user;
            try {
                // 首先尝试直接通过用户名获取
                user = await ctx.telegram.getChat(formattedUsername);
            } catch (error) {
                // 如果失败，尝试通过数字ID获取（如果输入的是数字）
                if (/^\d+$/.test(username)) {
                    user = await ctx.telegram.getChat(parseInt(username));
                } else {
                    throw error;
                }
            }

            if (!user) {
                return ctx.reply('❌ 未找到该用户，请确认用户名是否正确');
            }

            // 检查用户是否已经是所有者
            const isAlreadyOwner = await db.isBotOwner(user.id);
            if (isAlreadyOwner) {
                return ctx.reply('⚠️ 该用户已经是机器人所有者');
            }

            // 添加新所有者
            await db.setBotOwner(user.id, ctx.from.id);
            
            // 构建用户显示名称
            const displayName = user.username ? 
                              `@${user.username}` : 
                              user.first_name || `用户${user.id}`;
            
            ctx.reply(
                `✅ 已将 ${displayName} 添加为机器人所有者\n\n` +
                '新所有者拥有与您相同的权限：\n' +
                '1. 在任何群组中使用机器人\n' +
                '2. 添加和移除群组管理员\n' +
                '3. 添加其他机器人所有者\n' +
                '4. 查看所有记账相关数据'
            );
        } catch (error) {
            console.error('获取用户信息失败:', error);
            ctx.reply('❌ 未找到该用户，请确认用户名是否正确。\n提示：用户需要先与机器人有过交互才能被添加为所有者。');
        }
    } catch (error) {
        console.error('添加机器人所有者失败:', error);
        ctx.reply('❌ 添加机器人所有者失败，请重试');
    }
});

// 添加操作员命令（只有机器人所有者可以使用）
bot.hears(/^添加操作员\s*(?:@?(\w+))?$/, requireBotOwner, async (ctx) => {
    try {
        let newAdminId;
        let newAdminName;

        // 如果是回复消息
        if (ctx.message.reply_to_message) {
            newAdminId = ctx.message.reply_to_message.from.id;
            newAdminName = ctx.message.reply_to_message.from.username || 
                          ctx.message.reply_to_message.from.first_name;
        } 
        // 如果提供了用户名或ID
        else if (ctx.match[1]) {
            const userInput = ctx.match[1];
            try {
                // 尝试通过用户名或ID获取用户信息
                const user = /^\d+$/.test(userInput) ?
                    await ctx.telegram.getChat(parseInt(userInput)) :
                    await ctx.telegram.getChat('@' + userInput);
                
                newAdminId = user.id;
                newAdminName = user.username || user.first_name || `用户${user.id}`;
            } catch (error) {
                return ctx.reply('⚠️ 未找到该用户，请确保：\n1. 用户ID或用户名正确\n2. 该用户已经与机器人有过交互');
            }
        } else {
            return ctx.reply('⚠️ 请使用以下方式添加操作员：\n1. 回复要添加的用户的消息\n2. 输入"添加操作员 用户ID"\n3. 输入"添加操作员 @用户名"');
        }

        // 检查用户是否已经是操作员
        const admins = await db.getAdmins(ctx.chat.id);
        if (admins.includes(newAdminId)) {
            return ctx.reply('⚠️ 该用户已经是操作员');
        }

        await db.addAdmin(ctx.chat.id, newAdminId);
        ctx.reply(`✅ 已将 ${newAdminName} 添加为本群操作员`);
    } catch (error) {
        console.error('添加操作员失败:', error);
        ctx.reply('❌ 添加操作员失败，请重试');
    }
});

// 移除操作员命令（只有机器人所有者可以使用）
bot.hears(/^移除操作员\s*(?:@?(\w+))?$/, requireBotOwner, async (ctx) => {
    try {
        let adminId;
        let adminName;

        // 如果是回复消息
        if (ctx.message.reply_to_message) {
            adminId = ctx.message.reply_to_message.from.id;
            adminName = ctx.message.reply_to_message.from.username || 
                       ctx.message.reply_to_message.from.first_name;
        }
        // 如果提供了用户名或ID
        else if (ctx.match[1]) {
            const userInput = ctx.match[1];
            try {
                // 尝试通过用户名或ID获取用户信息
                const user = /^\d+$/.test(userInput) ?
                    await ctx.telegram.getChat(parseInt(userInput)) :
                    await ctx.telegram.getChat('@' + userInput);
                
                adminId = user.id;
                adminName = user.username || user.first_name || `用户${user.id}`;
            } catch (error) {
                return ctx.reply('⚠️ 未找到该用户，请确保：\n1. 用户ID或用户名正确\n2. 该用户已经与机器人有过交互');
            }
        } else {
            return ctx.reply('⚠️ 请使用以下方式移除操作员：\n1. 回复要移除的用户的消息\n2. 输入"移除操作员 用户ID"\n3. 输入"移除操作员 @用户名"');
        }

        // 检查用户是否是操作员
        const admins = await db.getAdmins(ctx.chat.id);
        if (!admins.includes(adminId)) {
            return ctx.reply('⚠️ 该用户不是操作员');
        }

        await db.removeAdmin(ctx.chat.id, adminId);
        ctx.reply(`✅ 已移除 ${adminName} 的本群操作员权限`);
    } catch (error) {
        console.error('移除操作员失败:', error);
        ctx.reply('❌ 移除操作员失败，请重试');
    }
});

// 查看操作员列表命令
bot.hears(/^操作员$/, async (ctx) => {
    try {
        const admins = await db.getAdmins(ctx.chat.id);
        if (!admins || admins.length === 0) {
            return ctx.reply('📝 当前群组暂无操作员');
        }

        let message = '📝 当前群组操作员列表：\n\n';
        for (const adminId of admins) {
            try {
                const member = await ctx.getChatMember(adminId);
                const name = member.user.username || member.user.first_name;
                message += `- ${name}\n`;
            } catch (error) {
                message += `- ID: ${adminId}\n`;
            }
        }
        
        ctx.reply(message);
    } catch (error) {
        console.error('获取操作员列表失败:', error);
        ctx.reply('❌ 获取操作员列表失败，请重试');
    }
});

// 设置汇率
bot.hears(/^设置汇率\s*([0-9.]+)$/, requireAdmin, async (ctx) => {
    const rate = parseFloat(ctx.match[1]);
    if (isNaN(rate) || rate < 0) {
        return ctx.reply('⚠️ 请输入正确的汇率（大于等于0）');
    }

    await db.setExchangeRate(ctx.chat.id, rate);
    ctx.reply(`✅ 汇率已设置为: ${rate}`);
});

// 添加费率设置命令
bot.hears(/^设置费率\s*([0-9.]+)$/, requireAdmin, async (ctx) => {
    const feeRate = parseFloat(ctx.match[1]);
    if (isNaN(feeRate) || feeRate < 0 || feeRate > 100) {
        return ctx.reply('⚠️ 请输入正确的费率（0-100）');
    }
    
    await db.setFeeRate(ctx.chat.id, feeRate);
    ctx.reply(`✅ 费率已设置为: ${feeRate}%`);
});

// 添加一个数字格式化函数
function formatNumber(num) {
    return Number.isInteger(num) ? num.toString() : num.toFixed(2);
}

// 创建一个生成汇总信息的函数
async function generateSummary(ctx) {
    const resetTime = await db.getResetTime(ctx.chat.id);
    const records = await db.getTodayTransactions(ctx.chat.id, resetTime);
    const defaultRate = await db.getExchangeRate(ctx.chat.id) || 0;
    const feeRate = await db.getFeeRate(ctx.chat.id) || 0;
    
    // 按时间排序并格式化记录
    const formattedRecords = records.map(record => {
        const time = new Date(record.created_at).toLocaleString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'Asia/Shanghai'
        });
        return {
            time,
            amount: record.amount,
            original_amount: record.original_amount,
            rate: record.rate,
            type: record.type
        };
    });

    // 过滤并分类统计
    const incomeRecords = formattedRecords
        .filter(r => r.type === 'income' && r.original_amount > 0);
    const expenseRecords = formattedRecords
        .filter(r => r.type === 'expense' && r.original_amount > 0);
    
    // 计算总额时正确处理修正记录
    const totalIncomeCNY = formattedRecords
        .filter(r => r.type === 'income' || r.type === 'correction')
        .reduce((sum, r) => sum + r.original_amount, 0);
    
    const totalIncomeUSDT = formattedRecords
        .filter(r => r.type === 'income' || r.type === 'correction')
        .reduce((sum, r) => sum + r.amount, 0);
    
    const totalExpenseUSDT = formattedRecords
        .filter(r => r.type === 'expense')
        .reduce((sum, r) => sum + Math.abs(r.amount), 0);

    // 格式化输出
    let message = `已入账(${incomeRecords.length}笔):\n`;
    incomeRecords.forEach(r => {
        message += `${r.time} ${formatNumber(Math.abs(r.original_amount))}/${r.rate} = ${formatNumber(Math.abs(r.amount))}\n`;
    });
    message += '\n';

    message += `已下发(${expenseRecords.length}笔):\n`;
    expenseRecords.forEach(r => {
        message += `${r.time} ${formatNumber(Math.abs(r.original_amount))} USDT\n`;
    });
    message += '\n';

    message += `总入款额: ${formatNumber(totalIncomeCNY)}\n`;
    if (feeRate > 0) {
        message += `当前费率: ${feeRate}%\n`;
    }
    if (defaultRate > 0) message += `当前汇率: ${defaultRate}\n`;
    message += '\n';

    message += `应下发: ${formatNumber(totalIncomeUSDT)} USDT\n`;
    message += `已下发: ${formatNumber(totalExpenseUSDT)} USDT\n`;
    message += `未下发: ${formatNumber(totalIncomeUSDT - totalExpenseUSDT)} USDT`;

    // 获取web链接
    const serverUrl = process.env.SERVER_URL;
    // 验证 URL 是否是有效的 HTTPS URL
    if (serverUrl && serverUrl.startsWith('https://')) {
        try {
            const url = new URL(serverUrl);
            const webUrl = `${serverUrl}/chat/${ctx.chat.id}`;
            // 创建内联键盘按钮
            const keyboard = {
                inline_keyboard: [[
                    { text: '账单详情', url: webUrl }
                ]]
            };
            // 返回消息和键盘
            return { text: message, keyboard };
        } catch (error) {
            console.error('Invalid SERVER_URL:', error);
        }
    }

    return { text: message };
}

// 处理收入记账 (+)
bot.hears(/^\+([0-9]+(?:\.[0-9]+)?(?:\/[0-9.]+)?)$/, requireAdmin, async (ctx) => {
    const text = ctx.match[1];
    let amount, rate;

    // 获取设置
    const defaultRate = await db.getExchangeRate(ctx.chat.id) || 0;
    const feeRate = await db.getFeeRate(ctx.chat.id) || 0;

    if (text.includes('/')) {
        // 如果包含 "/"，说明是指定汇率的USDT交易
        const parts = text.split('/');
        amount = parseFloat(parts[0]);
        rate = parseFloat(parts[1]);
    } else {
        // 不包含 "/"，使用默认设置
        amount = parseFloat(text);
        rate = defaultRate;
    }

    if (isNaN(amount) || isNaN(rate) || rate < 0) {
        return ctx.reply('⚠️ 请输入正确的金额和汇率');
    }

    let actualAmount;
    let description;

    if (rate > 0) {
        // 有汇率时，使用USDT模式
        actualAmount = amount / rate;  // 转换为USDT
        if (feeRate > 0) {
            actualAmount = actualAmount * (1 - feeRate / 100);  // 如果有费率，扣除费率
            description = `收入 ${amount} CNY (费率${feeRate}%, 费用${(amount / rate * feeRate / 100).toFixed(2)} USDT)`;
        } else {
            description = `收入 ${amount} CNY = ${(amount / rate).toFixed(2)} USDT`;
        }
    } else {
        // 没有汇率时，使用CNY模式
        actualAmount = amount;
        if (feeRate > 0) {
            actualAmount = amount * (1 - feeRate / 100);  // 如果有费率，扣除费率
            description = `收入 ${amount} CNY (费率${feeRate}%, 实际 ${actualAmount.toFixed(2)} CNY)`;
        } else {
            description = `收入 ${amount} CNY`;
        }
    }

    await db.addTransaction(
        ctx.chat.id,
        actualAmount,
        amount,
        'income',
        rate || 1,
        description,
        ctx.chat.title || `群组 ${ctx.chat.id}`
    );

    const summary = await generateSummary(ctx);
    await ctx.reply(summary.text, summary.keyboard ? { reply_markup: summary.keyboard } : {});
});

// 处理修正命令 (-)
bot.hears(/^-[0-9]+(?:\/[0-9.]+)?$/, requireAdmin, async (ctx) => {
    const text = ctx.message.text.substring(1);
    let amount, rate;

    // 获取设置
    const defaultRate = await db.getExchangeRate(ctx.chat.id) || 0;

    if (text.includes('/')) {
        const parts = text.split('/');
        amount = parseFloat(parts[0]);
        rate = parseFloat(parts[1]);
    } else {
        amount = parseFloat(text);
        rate = defaultRate;
    }

    if (isNaN(amount) || isNaN(rate) || rate < 0) {
        return ctx.reply('⚠️ 请输入正确的金额和汇率');
    }

    try {
        // 删除最近一笔匹配的收入记录
        await db.deleteLastTransaction(ctx.chat.id, amount, 'income');
        ctx.reply('✅ 已删除对应的收入记录');

        const summary = await generateSummary(ctx);
        await ctx.reply(summary.text, summary.keyboard ? { reply_markup: summary.keyboard } : {});
    } catch (err) {
        console.error('修正错误:', err);
        ctx.reply('❌ 未找到对应的收入记录，请检查金额是否正确');
    }
});

// 处理下发命令
bot.hears(/^下发\s*([0-9.]+)$/, requireAdmin, async (ctx) => {
    const amount = parseFloat(ctx.match[1]);
    if (isNaN(amount) || amount <= 0) {
        return ctx.reply('⚠️ 请输入正确的金额');
    }

    try {
        // 获取设置
        const defaultRate = await db.getExchangeRate(ctx.chat.id) || 0;
        const feeRate = await db.getFeeRate(ctx.chat.id) || 0;

        // 根据模式处理下发金额
        const result = -amount; // 支出为负数
        const currency = defaultRate > 0 ? 'USDT' : 'CNY';
        await db.addTransaction(
            ctx.chat.id,
            result,
            amount,
            'expense',
            defaultRate || 1,
            `下发 ${amount} ${currency}`,
            ctx.chat.title || `群组 ${ctx.chat.id}`
        );

        const summary = await generateSummary(ctx);
        await ctx.reply(summary.text, summary.keyboard ? { reply_markup: summary.keyboard } : {});
    } catch (err) {
        console.error('下发处理错误:', err);
        ctx.reply('❌ 下发处理失败，请重试');
    }
});

// 处理下发修正命令
bot.hears(/^下发\s*-([0-9.]+)$/, requireAdmin, async (ctx) => {
    const amount = parseFloat(ctx.match[1]);
    if (isNaN(amount) || amount <= 0) {
        return ctx.reply('⚠️ 请输入正确的金额');
    }

    try {
        // 删除最近一笔匹配的下发记录
        await db.deleteLastTransaction(ctx.chat.id, amount, 'expense');
        ctx.reply('✅ 已删除对应的下发记录');

        const summary = await generateSummary(ctx);
        await ctx.reply(summary.text, summary.keyboard ? { reply_markup: summary.keyboard } : {});
    } catch (err) {
        console.error('下发修正错误:', err);
        ctx.reply('❌ 未找到对应的下发记录，请检查金额是否正确');
    }
});

// 查询余额
bot.hears(/^余额$/, async (ctx) => {
    const balance = await db.getBalance(ctx.chat.id);
    const defaultRate = await db.getExchangeRate(ctx.chat.id) || 0;
    const currency = defaultRate > 0 ? 'USDT' : 'CNY';
    ctx.reply(`💰 当前余额：${balance.toFixed(2)} ${currency}`);
});

// 查询历史记录
bot.command('history', async (ctx) => {
    const history = await db.getTransactionHistory(ctx.chat.id);
    if (history.length === 0) {
        return ctx.reply('📝 暂无交易记录');
    }

    const defaultRate = await db.getExchangeRate(ctx.chat.id) || 0;
    const currency = defaultRate > 0 ? 'USDT' : 'CNY';

    let message = '📝 最近交易记录：\n\n';
    history.forEach((record, index) => {
        const date = new Date(record.created_at).toLocaleString('zh-CN');
        const amount = record.amount.toFixed(2);
        const type = record.type === 'income' ? '收入' : '支出';
        message += `${index + 1}. ${date}\n   ${type}: ${amount} ${currency}\n   ${record.description}\n\n`;
    });

    ctx.reply(message);
});

// 汇总命令
bot.hears(/^汇总$/, async (ctx) => {
    const summary = await generateSummary(ctx);
    await ctx.reply(summary.text, summary.keyboard ? { reply_markup: summary.keyboard } : {});
});

// 修改获取 HTX OTC 价格的函数
async function getHtxPrice() {
    try {
        const response = await axios.get('https://www.htx.com/-/x/otc/v1/data/trade-market', {
            params: {
                coinId: 2,
                currency: 172,
                tradeType: 'sell',
                currPage: 1,
                payMethod: 0,
                acceptOrder: 0,
                blockType: 'general',
                online: 1,
                range: 0,
                onlyTradable: false,
                isFollowed: false
            }
        });

        if (response.data && response.data.data) {
            // 定义黑名单商户关键词
            const blacklist = ['小程序专享', '活动特价'];
            
            // 过滤掉黑名单商户，并获取前10个商家
            const filteredSellers = response.data.data
                .filter(seller => !blacklist.some(keyword => 
                    seller.userName.toLowerCase().includes(keyword.toLowerCase())
                ))
                .slice(0, 10);

            return filteredSellers.map(seller => ({
                price: seller.price,
                userName: seller.userName
            }));
        }
        return null;
    } catch (error) {
        console.error('获取 HTX 价格失败:', error);
        return null;
    }
}

// 修改查询 HTX 价格的命令，支持 z0 和 Z0
bot.hears(/^[zZ]0$/, async (ctx) => {
    const sellers = await getHtxPrice();
    if (sellers && sellers.length > 0) {
        let message = '火币商家实时交易汇率 🔝Top 10\n\n';
        // 只显示有数据的商家
        sellers.forEach((seller, index) => {
            message += `${seller.price} （${index}）${seller.userName}\n`;
        });
        ctx.reply(message);
    } else {
        ctx.reply('❌ 获取 HTX 价格失败，请稍后重试');
    }
});

// 修改计算功能，只在有运算符时才触发
bot.hears(/^[\d\s]*[\+\-\*\/\(\)][\d\s\+\-\*\/\(\)\.]*$/, async (ctx) => {
    const expression = ctx.message.text.trim();
    try {
        // 计算表达式
        const result = math.evaluate(expression);
        
        // 格式化结果
        let formattedResult;
        if (Number.isInteger(result)) {
            formattedResult = result.toString();
        } else if (typeof result === 'number') {
            formattedResult = result.toFixed(8).replace(/\.?0+$/, '');
        } else {
            formattedResult = result.toString();
        }

        // 使用 code 标签格式显示结果
        ctx.reply(`<code>${formattedResult}</code>`, { 
            parse_mode: 'HTML',
            reply_to_message_id: ctx.message.message_id 
        });
    } catch (error) {
        // 如果计算出错，不显示错误信息，因为可能是普通聊天内容
        return;
    }
});

// 修改设置日切时间的命令
bot.hears(/^设置日切\s*([0-2][0-9]):([0-5][0-9])$/, requireAdmin, async (ctx) => {
    const hours = parseInt(ctx.match[1]);
    const minutes = parseInt(ctx.match[2]);
    const time = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

    try {
        await db.setResetTime(ctx.chat.id, time);
        // 设置新的日切任务
        await scheduler.scheduleForChat(ctx.chat.id);

        // 计算下次日切时间
        const now = new Date();
        const nextReset = new Date();
        nextReset.setHours(hours, minutes, 0, 0);
        
        // 如果设置时间已经过了，调整到明天
        if (nextReset <= now) {
            nextReset.setDate(nextReset.getDate() + 1);
        }

        // 确定是今天还是明天
        const isToday = nextReset.getDate() === now.getDate();
        const dayText = isToday ? '今天' : '明天';
        
        ctx.reply(`✅ 日切时间已设置为: ${time}\n下次日切将在${dayText} ${time} 执行`);
    } catch (err) {
        console.error('设置日切时间失败:', err);
        ctx.reply('❌ 设置日切时间失败，请重试');
    }
});

// 添加手动执行日切的命令
bot.command('daycut', requireAdmin, async (ctx) => {
    try {
        // 先获取当前统计数据
        const summary = await generateSummary(ctx);
        
        // 执行日切操作
        await db.executeDayCut(ctx.chat.id);
        
        // 发送日切前的最后统计
        await ctx.reply('📊 日切前统计：\n\n' + summary.text);
        
        // 重置统计数据的显示
        await ctx.reply('✅ 日切操作已执行，统计数据已重置');
        
        // 显示新的空统计
        const newSummary = await generateSummary(ctx);
        await ctx.reply('新的统计数据：\n\n' + newSummary.text);
    } catch (err) {
        console.error('手动执行日切失败:', err);
        ctx.reply('❌ 手动执行日切失败，请重试');
    }
});

// 添加获取web链接的命令
bot.command('web', async (ctx) => {
    try {
        const serverUrl = process.env.SERVER_URL;
        if (!serverUrl) {
            return ctx.reply('❌ 服务器地址未配置，请联系管理员设置 SERVER_URL');
        }

        // 验证 URL 格式
        try {
            new URL(serverUrl);
        } catch (e) {
            return ctx.reply('❌ 服务器地址格式无效，请联系管理员检查配置');
        }

        const chatId = ctx.chat.id;
        const chatTitle = ctx.chat.title || `群组 ${chatId}`;
        
        // 更新群组标题
        await db.updateChatTitle(chatId, chatTitle);
        
        // 生成web链接
        const webUrl = `${serverUrl}/chat/${chatId}`;
        
        // 创建内联键盘按钮
        const keyboard = {
            inline_keyboard: [[
                { text: '查看交易记录', url: webUrl }
            ]]
        };
        
        // 发送消息和按钮
        await ctx.reply(
            `📊 点击下方按钮查看交易记录：\n${webUrl}`,
            { reply_markup: keyboard }
        );
    } catch (error) {
        console.error('获取web链接失败:', error);
        ctx.reply('❌ 获取web链接失败，请稍后重试');
    }
});

// 处理费率计算命令
bot.hears(/^计算费率\s+([0-9.]+)\s+([0-9.]+)$/, async (ctx) => {
    try {
        const price = parseFloat(ctx.match[1]);  // 币价
        const rate = parseFloat(ctx.match[2]);   // 汇率
        
        if (isNaN(price) || isNaN(rate) || price <= 0 || rate <= 0) {
            return ctx.reply('⚠️ 请输入正确的币价和汇率');
        }
        
        // 计算费率: (1 - 币价/汇率) × 100
        const fee = (1 - price/rate) * 100;
        
        await ctx.reply(
            `币价：${price}\n` +
            `汇率：${rate}\n` +
            `费率计算结果：${fee.toFixed(2)}%`
        );
    } catch (error) {
        console.error('计算费率错误:', error);
        await ctx.reply('❌ 计算失败');
    }
});

// 处理汇率计算命令
bot.hears(/^计算汇率\s+([0-9.]+)\s+([0-9.]+)$/, async (ctx) => {
    try {
        const price = parseFloat(ctx.match[1]);  // 币价
        const fee = parseFloat(ctx.match[2]);    // 费率
        
        if (isNaN(price) || isNaN(fee) || price <= 0 || fee >= 100) {
            return ctx.reply('⚠️ 请输入正确的币价和费率');
        }
        
        // 计算汇率: 币价 / (1 - 费率/100)
        const rate = price / (1 - fee/100);
        
        await ctx.reply(
            `币价：${price}\n` +
            `费率：${fee}%\n` +
            `汇率计算结果：${rate.toFixed(2)}`
        );
    } catch (error) {
        console.error('计算汇率错误:', error);
        await ctx.reply('❌ 计算失败');
    }
});

// 添加获取机器人所有者信息的函数
async function getBotOwnerInfo(ctx, ownerId) {
    try {
        const member = await ctx.telegram.getChatMember(ctx.chat.id, ownerId);
        return member.user.username || member.user.first_name || `ID: ${ownerId}`;
    } catch (error) {
        return `ID: ${ownerId}`;
    }
}

// 查看机器人所有者命令
bot.command('owner', async (ctx) => {
    try {
        const owners = await db.getAllBotOwners();
        if (!owners || owners.length === 0) {
            return ctx.reply('📝 机器人暂未设置所有者');
        }

        let message = '👑 机器人所有者列表：\n\n';
        
        for (const owner of owners) {
            const ownerName = await getBotOwnerInfo(ctx, owner.user_id);
            const ownerSetTime = new Date(owner.created_at).toLocaleString('zh-CN', {
                timeZone: 'Asia/Shanghai',
                hour12: false
            });
            
            message += `用户：${ownerName}\n`;
            message += `设置时间：${ownerSetTime}\n`;
            
            if (owner.added_by) {
                const adderName = await getBotOwnerInfo(ctx, owner.added_by);
                message += `添加者：${adderName}\n`;
            } else {
                message += '创建者（第一所有者）\n';
            }
            message += '\n';
        }

        await ctx.reply(message);
    } catch (error) {
        console.error('获取机器人所有者信息失败:', error);
        ctx.reply('❌ 获取机器人所有者信息失败，请重试');
    }
});

// 添加查看用户ID的命令
bot.hears(/^id$/i, async (ctx) => {
    try {
        // 如果是回复某人的消息
        if (ctx.message.reply_to_message) {
            const user = ctx.message.reply_to_message.from;
            const message = user.username ? 
                `用户名：@${user.username}\n用户ID：${user.id}` :
                `用户ID：${user.id}`;
            await ctx.reply(message);
        } else {
            // 如果是直接使用命令
            const user = ctx.from;
            const message = user.username ? 
                `用户名：@${user.username}\n用户ID：${user.id}` :
                `用户ID：${user.id}`;
            await ctx.reply(message);
        }
    } catch (error) {
        console.error('获取用户ID失败:', error);
        ctx.reply('❌ 获取用户信息失败，请重试');
    }
});

// 添加开启记账功能的命令
bot.hears(/^开始$/, requireBotOwner, async (ctx) => {
    try {
        await db.enableAccounting(ctx.chat.id);
        await ctx.reply(
            '✅ 记账功能已启用\n\n' +
            '使用说明：\n' +
            '1. 设置汇率：设置汇率7.35\n' +
            '2. 记录收入：+100 或 +100/7.35\n' +
            '3. 记录支出：-100 或 -100/7.35\n' +
            '注意：只有本群操作员可以使用记账功能\n' +
            '只有机器人所有者可以添加群组操作员'
        );
    } catch (error) {
        console.error('启用记账功能失败:', error);
        ctx.reply('❌ 启用记账功能失败，请重试');
    }
});

// 添加关闭记账功能的命令
bot.hears(/^关闭记账$/, requireBotOwner, async (ctx) => {
    try {
        await db.disableAccounting(ctx.chat.id);
        await ctx.reply('✅ 记账功能已关闭，发送"开始"可重新启用');
    } catch (error) {
        console.error('关闭记账功能失败:', error);
        ctx.reply('❌ 关闭记账功能失败，请重试');
    }
});

// 添加设置实时汇率的命令
bot.hears(/^设置实时汇率$/, requireAdmin, async (ctx) => {
    try {
        const sellers = await getHtxPrice();
        if (!sellers || sellers.length === 0) {
            return ctx.reply('❌ 获取实时汇率失败，请稍后重试');
        }

        // 获取第一个商家的价格作为参考汇率
        const rate = sellers[0].price;
        
        // 设置新汇率
        await db.setExchangeRate(ctx.chat.id, rate);
        
        // 构建回复消息
        let message = `✅ 已自动设置当前火币最优汇率：${rate}\n\n`;
        message += '火币商家报价 Top 3：\n';
        
        // 显示前三个商家的报价
        sellers.slice(0, 3).forEach((seller, index) => {
            message += `${seller.price} （${index}）${seller.userName}\n`;
        });
        
        ctx.reply(message);
    } catch (error) {
        console.error('设置实时汇率失败:', error);
        ctx.reply('❌ 设置实时汇率失败，请重试');
    }
});

// 错误处理
bot.catch((err, ctx) => {
    console.error('Bot error:', err);
    ctx.reply('❌ 发生错误，请稍后重试');
});

// 启动 bot
bot.launch().then(() => {
    console.log('✅ Bot 已启动');
}).catch(err => {
    console.error('❌ Bot 启动失败:', err);
});

// 优雅关闭
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
