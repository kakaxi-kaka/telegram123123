const schedule = require('node-schedule');
const db = require('./database');

class DayCutScheduler {
    constructor() {
        this.jobs = new Map();
    }

    // 为每个聊天设置日切任务
    async scheduleForChat(chatId) {
        // 取消已存在的任务
        if (this.jobs.has(chatId)) {
            this.jobs.get(chatId).cancel();
        }

        // 获取日切时间
        const resetTime = await db.getResetTime(chatId);
        const [hours, minutes] = resetTime.split(':').map(Number);

        // 创建定时任务
        const job = schedule.scheduleJob(`${minutes} ${hours} * * *`, async () => {
            console.log(`🔄 [INFO] 执行日切操作：chat_id=${chatId}, time=${resetTime}`);
            await db.executeDayCut(chatId);
        });

        this.jobs.set(chatId, job);
        console.log(`✅ [SUCCESS] 已设置日切任务：chat_id=${chatId}, time=${resetTime}`);
    }

    // 取消聊天的日切任务
    cancelForChat(chatId) {
        if (this.jobs.has(chatId)) {
            this.jobs.get(chatId).cancel();
            this.jobs.delete(chatId);
            console.log(`✅ [SUCCESS] 已取消日切任务：chat_id=${chatId}`);
        }
    }
}

module.exports = new DayCutScheduler(); 