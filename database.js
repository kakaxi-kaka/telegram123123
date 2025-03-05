const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./transactions.db', (err) => {
    if (err) console.error('❌ 数据库连接失败:', err);
    else console.log('✅ 数据库连接成功');
});

// 初始化所有表
db.serialize(() => {
    // 删除旧表
    db.run(`DROP TABLE IF EXISTS transactions`);
    db.run(`DROP TABLE IF EXISTS exchange_rate`);
    db.run(`DROP TABLE IF EXISTS day_cuts`);
    db.run(`DROP TABLE IF EXISTS admins`);
    db.run(`DROP TABLE IF EXISTS bot_owner`);
    db.run(`DROP TABLE IF EXISTS group_settings`);
    
    // 创建机器人所有者表（支持多个所有者）
    db.run(`
        CREATE TABLE IF NOT EXISTS bot_owner (
            user_id INTEGER,
            added_by INTEGER,  -- 由谁添加的
            created_at DATETIME DEFAULT (datetime('now', '+8 hours')),
            PRIMARY KEY (user_id)
        )
    `);

    // 创建汇率表
    db.run(`
        CREATE TABLE IF NOT EXISTS exchange_rate (
            chat_id INTEGER PRIMARY KEY,
            rate REAL,
            fee_rate REAL DEFAULT 0,
            reset_time TEXT DEFAULT '00:00'  -- 添加日切时间字段，默认零点
        )
    `);

    // 创建新的交易记录表，添加 original_amount 字段记录原始金额
    db.run(`
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id INTEGER NOT NULL,
            chat_title TEXT,
            amount REAL NOT NULL,
            original_amount REAL NOT NULL,
            type TEXT NOT NULL,
            description TEXT,
            rate REAL NOT NULL,
            day_cut_time TEXT,  -- 添加日切时间字段，用于标记记录是否已被日切
            created_at DATETIME DEFAULT (datetime(CURRENT_TIMESTAMP, '+8 hours'))  -- 使用北京时间
        )
    `);

    // 创建日切记录表
    db.run(`
        CREATE TABLE IF NOT EXISTS day_cuts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id INTEGER NOT NULL,
            cut_time DATETIME NOT NULL,
            total_income_cny REAL NOT NULL,
            total_income_usdt REAL NOT NULL,
            total_expense_usdt REAL NOT NULL,
            created_at DATETIME DEFAULT (datetime('now', '+8 hours'))
        )
    `);

    // 创建管理员表
    db.run(`
        CREATE TABLE IF NOT EXISTS admins (
            chat_id INTEGER,
            user_id INTEGER,
            created_at DATETIME DEFAULT (datetime('now', '+8 hours')),
            PRIMARY KEY (chat_id, user_id)
        )
    `, [], (err) => {
        if (err) {
            console.error('❌ 创建管理员表失败:', err);
        } else {
            console.log('✅ 管理员表创建成功');
        }
    });

    // 创建群组设置表
    db.run(`
        CREATE TABLE IF NOT EXISTS group_settings (
            chat_id INTEGER PRIMARY KEY,
            exchange_rate REAL DEFAULT 0,
            fee_rate REAL DEFAULT 0,
            reset_time TEXT DEFAULT '00:00',
            accounting_enabled INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

// 添加一个获取中国时间的辅助函数
function getChinaTime(date = new Date()) {
    return new Date(date.getTime() + (8 * 60 * 60 * 1000));
}

// 获取所有群组
async function getAllChats() {
    return new Promise((resolve, reject) => {
        db.all('SELECT DISTINCT chat_id, chat_title FROM transactions ORDER BY chat_id', [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// 获取单个群组信息
async function getChat(chatId) {
    return new Promise((resolve, reject) => {
        db.get('SELECT DISTINCT chat_id, chat_title FROM transactions WHERE chat_id = ?', [chatId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

// 更新群组标题
async function updateChatTitle(chatId, chatTitle) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE transactions SET chat_title = ? WHERE chat_id = ?`,
            [chatTitle, chatId],
            function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            }
        );
    });
}

// 添加管理员表
function createAdminTable() {
    return new Promise((resolve, reject) => {
        db.run(`
            CREATE TABLE IF NOT EXISTS admins (
                chat_id INTEGER,
                user_id INTEGER,
                created_at DATETIME DEFAULT (datetime('now', '+8 hours')),
                PRIMARY KEY (chat_id, user_id)
            )
        `, [], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

// 添加管理员
function addAdmin(chatId, userId) {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT OR IGNORE INTO admins (chat_id, user_id) VALUES (?, ?)',
            [chatId, userId],
            function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            }
        );
    });
}

// 移除管理员
function removeAdmin(chatId, userId) {
    return new Promise((resolve, reject) => {
        db.run(
            'DELETE FROM admins WHERE chat_id = ? AND user_id = ?',
            [chatId, userId],
            function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            }
        );
    });
}

// 获取管理员列表
function getAdmins(chatId) {
    return new Promise((resolve, reject) => {
        db.all(
            'SELECT user_id FROM admins WHERE chat_id = ?',
            [chatId],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows ? rows.map(row => row.user_id) : []);
            }
        );
    });
}

// 初始化数据库
async function initDatabase() {
    try {
        await createAdminTable();
        console.log('✅ 管理员表创建成功');
    } catch (err) {
        console.error('❌ 创建管理员表失败:', err);
    }
}

module.exports = {
    // 汇率相关操作
    setExchangeRate: (chat_id, rate) => {
        console.log(`🔍 [DEBUG] 设置汇率：chat_id=${chat_id}, rate=${rate}`);
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO exchange_rate (chat_id, rate) VALUES (?, ?) 
                 ON CONFLICT(chat_id) DO UPDATE SET rate = ?`,
                [chat_id, rate, rate],
                function (err) {
                    if (err) {
                        console.error('❌ [ERROR] 设置汇率失败:', err);
                        reject(err);
                    } else {
                        console.log(`✅ [SUCCESS] 汇率 ${rate} 已存入数据库`);
                        resolve(true);
                    }
                }
            );
        });
    },

    getExchangeRate: (chat_id) => {
        console.log(`🔍 [DEBUG] 查询汇率：chat_id=${chat_id}`);
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT rate FROM exchange_rate WHERE chat_id = ?`,
                [chat_id],
                (err, row) => {
                    if (err) {
                        console.error('❌ [ERROR] 查询汇率失败:', err);
                        reject(err);
                    } else {
                        const rate = row ? row.rate : null;
                        console.log(`✅ [SUCCESS] 读取到汇率：${rate || '未设置'}`);
                        resolve(rate);
                    }
                }
            );
        });
    },

    // 交易记录相关操作
    addTransaction: (chat_id, amount, original_amount, type, rate, description = '', chat_title = '') => {
        console.log(`🔍 [DEBUG] 添加交易记录：chat_id=${chat_id}, amount=${amount}, type=${type}`);
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO transactions (
                    chat_id, amount, original_amount, type, rate, description, 
                    chat_title, created_at
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?,
                    datetime('now', '+8 hours')
                )`,
                [chat_id, amount, original_amount, type, rate, description, chat_title],
                function (err) {
                    if (err) {
                        console.error('❌ [ERROR] 添加交易记录失败:', err);
                        reject(err);
                    } else {
                        console.log(`✅ [SUCCESS] 交易记录已添加，ID: ${this.lastID}`);
                        resolve(this.lastID);
                    }
                }
            );
        });
    },

    getBalance: (chat_id) => {
        console.log(`🔍 [DEBUG] 查询余额：chat_id=${chat_id}`);
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT COALESCE(SUM(amount), 0) as balance 
                 FROM transactions 
                 WHERE chat_id = ?`,
                [chat_id],
                (err, row) => {
                    if (err) {
                        console.error('❌ [ERROR] 查询余额失败:', err);
                        reject(err);
                    } else {
                        console.log(`✅ [SUCCESS] 余额查询完成：${row.balance}`);
                        resolve(row.balance);
                    }
                }
            );
        });
    },

    getTransactionHistory: (chat_id, limit = 10) => {
        console.log(`🔍 [DEBUG] 查询交易历史：chat_id=${chat_id}, limit=${limit}`);
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM transactions 
                 WHERE chat_id = ? 
                 ORDER BY created_at DESC 
                 LIMIT ?`,
                [chat_id, limit],
                (err, rows) => {
                    if (err) {
                        console.error('❌ [ERROR] 查询交易历史失败:', err);
                        reject(err);
                    } else {
                        console.log(`✅ [SUCCESS] 查询到 ${rows.length} 条交易记录`);
                        resolve(rows);
                    }
                }
            );
        });
    },

    // 添加费率设置函数
    setFeeRate: (chat_id, feeRate) => {
        console.log(`🔍 [DEBUG] 设置费率：chat_id=${chat_id}, fee_rate=${feeRate}`);
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO exchange_rate (chat_id, fee_rate) 
                 VALUES (?, ?) 
                 ON CONFLICT(chat_id) DO UPDATE SET fee_rate = ?`,
                [chat_id, feeRate, feeRate],
                function (err) {
                    if (err) {
                        console.error('❌ [ERROR] 设置费率失败:', err);
                        reject(err);
                    } else {
                        console.log(`✅ [SUCCESS] 费率 ${feeRate}% 已存入数据库`);
                        resolve(true);
                    }
                }
            );
        });
    },

    getFeeRate: (chat_id) => {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT fee_rate FROM exchange_rate WHERE chat_id = ?`,
                [chat_id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? row.fee_rate : 0);
                }
            );
        });
    },

    // 添加删除最近记录的函数
    deleteLastTransaction: (chat_id, amount, type) => {
        console.log(`🔍 [DEBUG] 删除交易记录：chat_id=${chat_id}, amount=${amount}, type=${type}`);
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT id FROM transactions 
                 WHERE chat_id = ? AND original_amount = ? AND type = ?
                 ORDER BY created_at DESC LIMIT 1`,
                [chat_id, amount, type],
                (err, row) => {
                    if (err) {
                        console.error('❌ [ERROR] 查询记录失败:', err);
                        reject(err);
                        return;
                    }
                    if (!row) {
                        console.error('❌ [ERROR] 未找到匹配的记录');
                        reject(new Error('未找到匹配的记录'));
                        return;
                    }
                    db.run(
                        `DELETE FROM transactions WHERE id = ?`,
                        [row.id],
                        function(err) {
                            if (err) {
                                console.error('❌ [ERROR] 删除记录失败:', err);
                                reject(err);
                            } else {
                                console.log(`✅ [SUCCESS] 成功删除记录 ID: ${row.id}`);
                                resolve(this.changes);
                            }
                        }
                    );
                }
            );
        });
    },

    // 添加设置和获取日切时间的函数
    setResetTime: (chat_id, time) => {
        console.log(`🔍 [DEBUG] 设置日切时间：chat_id=${chat_id}, time=${time}`);
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO exchange_rate (chat_id, reset_time) 
                 VALUES (?, ?) 
                 ON CONFLICT(chat_id) DO UPDATE SET reset_time = ?`,
                [chat_id, time, time],
                function (err) {
                    if (err) {
                        console.error('❌ [ERROR] 设置日切时间失败:', err);
                        reject(err);
                    } else {
                        console.log(`✅ [SUCCESS] 日切时间已设置为 ${time}`);
                        resolve(true);
                    }
                }
            );
        });
    },

    getResetTime: (chat_id) => {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT reset_time FROM exchange_rate WHERE chat_id = ?`,
                [chat_id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? row.reset_time : '00:00');
                }
            );
        });
    },

    // 添加获取今日记录的函数
    getTodayTransactions: (chat_id, resetTime) => {
        return new Promise((resolve, reject) => {
            // 获取今天的日期（中国时间）
            const now = new Date();
            const chinaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
            
            // 解析重置时间
            const [resetHours, resetMinutes] = resetTime.split(':').map(Number);
            
            // 计算今天的重置时间点
            const today = new Date(chinaTime);
            today.setHours(resetHours, resetMinutes, 0, 0);
            
            // 如果当前时间小于重置时间，使用昨天的重置时间
            if (chinaTime < today) {
                today.setDate(today.getDate() - 1);
            }
            
            // 格式化日期为 YYYY-MM-DD HH:mm:ss
            const resetTimeStr = today.toISOString().slice(0, 19).replace('T', ' ');
            
            db.all(
                `SELECT * FROM transactions 
                 WHERE chat_id = ? 
                 AND datetime(created_at) >= datetime(?)
                 AND (day_cut_time IS NULL)  -- 只选择未被日切的记录
                 ORDER BY created_at DESC`,
                [chat_id, resetTimeStr],
                (err, rows) => {
                    if (err) reject(err);
                    else {
                        // 格式化时间显示
                        const formattedRows = rows.map(row => ({
                            ...row,
                            created_at: new Date(row.created_at).toLocaleString('zh-CN', {
                                timeZone: 'Asia/Shanghai',
                                hour12: false
                            })
                        }));
                        resolve(formattedRows);
                    }
                }
            );
        });
    },

    // 添加日切执行函数
    executeDayCut: (chat_id) => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                try {
                    // 1. 获取当前时间作为日切时间点
                    const cutTime = new Date().toISOString();
                    
                    // 2. 将当前数据保存到日切记录表
                    db.run(
                        `INSERT INTO day_cuts (
                            chat_id, 
                            cut_time, 
                            total_income_cny, 
                            total_income_usdt, 
                            total_expense_usdt
                        ) 
                        SELECT 
                            ?, 
                            datetime('now', '+8 hours'),
                            COALESCE(SUM(CASE WHEN type = 'income' THEN original_amount ELSE 0 END), 0),
                            COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0),
                            COALESCE(SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 0)
                        FROM transactions 
                        WHERE created_at >= datetime('now', 'start of day', '+8 hours')`,
                        [chat_id],
                        function(err) {
                            if (err) {
                                db.run('ROLLBACK');
                                console.error('❌ [ERROR] 保存日切记录失败:', err);
                                reject(err);
                                return;
                            }
                            
                            // 3. 更新所有今日记录的日切时间
                            db.run(
                                `UPDATE transactions 
                                 SET day_cut_time = ?
                                 WHERE created_at >= datetime('now', 'start of day', '+8 hours')
                                 AND day_cut_time IS NULL`,
                                [cutTime],
                                function(err) {
                                    if (err) {
                                        db.run('ROLLBACK');
                                        console.error('❌ [ERROR] 更新记录日切时间失败:', err);
                                        reject(err);
                                        return;
                                    }
                                    
                                    db.run('COMMIT');
                                    console.log(`✅ [SUCCESS] 日切执行完成：chat_id=${chat_id}`);
                                    resolve(true);
                                }
                            );
                        }
                    );
                } catch (err) {
                    db.run('ROLLBACK');
                    console.error('❌ [ERROR] 日切执行失败:', err);
                    reject(err);
                }
            });
        });
    },

    // 数据库关闭函数
    close: () => {
        return new Promise((resolve, reject) => {
            db.close((err) => {
                if (err) {
                    console.error('❌ [ERROR] 关闭数据库失败:', err);
                    reject(err);
                } else {
                    console.log('✅ [SUCCESS] 数据库已安全关闭');
                    resolve();
                }
            });
        });
    },

    // 按日期获取交易记录
    getTransactionsByDate: (chat_id, date) => {
        console.log(`🔍 [DEBUG] 按日期查询交易记录：chat_id=${chat_id}, date=${date}`);
        return new Promise((resolve, reject) => {
            // 构建日期范围
            const startDate = date + ' 00:00:00';
            const endDate = date + ' 23:59:59';
            
            db.all(
                `SELECT * FROM transactions 
                 WHERE chat_id = ? 
                 AND datetime(created_at) BETWEEN datetime(?) AND datetime(?)
                 ORDER BY created_at DESC`,
                [chat_id, startDate, endDate],
                (err, rows) => {
                    if (err) {
                        console.error('❌ [ERROR] 按日期查询交易记录失败:', err);
                        reject(err);
                    } else {
                        console.log(`✅ [SUCCESS] 查询到 ${rows.length} 条交易记录`);
                        resolve(rows);
                    }
                }
            );
        });
    },

    // 获取日期统计数据
    getDailyStats: (chat_id, date) => {
        console.log(`🔍 [DEBUG] 获取日期统计：chat_id=${chat_id}, date=${date}`);
        return new Promise((resolve, reject) => {
            const startDate = date + ' 00:00:00';
            const endDate = date + ' 23:59:59';
            
            db.get(
                `SELECT 
                    COUNT(CASE WHEN type = 'income' AND original_amount != 0 THEN 1 END) as income_count,
                    COUNT(CASE WHEN type = 'expense' AND original_amount != 0 THEN 1 END) as expense_count,
                    COALESCE(SUM(CASE WHEN type = 'income' AND original_amount != 0 THEN amount ELSE 0 END), 0) as total_income,
                    COALESCE(SUM(CASE WHEN type = 'expense' AND original_amount != 0 THEN amount ELSE 0 END), 0) as total_expense,
                    COALESCE(SUM(CASE WHEN type = 'income' AND original_amount != 0 THEN amount ELSE -amount END), 0) as net_amount
                FROM transactions 
                WHERE chat_id = ? 
                AND strftime('%Y-%m-%d', datetime(created_at, 'localtime')) = ?`,
                [chat_id, date],
                (err, row) => {
                    if (err) {
                        console.error('❌ [ERROR] 获取日期统计失败:', err);
                        reject(err);
                    } else {
                        console.log(`✅ [SUCCESS] 获取日期统计成功:`, row);
                        resolve(row);
                    }
                }
            );
        });
    },

    getAllChats,
    getChat,
    updateChatTitle,
    getChinaTime,

    // 获取总计统计数据
    getTotalStats: (chat_id) => {
        console.log(`🔍 [DEBUG] 获取总计统计：chat_id=${chat_id}`);
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT 
                    COUNT(CASE WHEN type = 'income' AND original_amount != 0 THEN 1 END) as total_income_count,
                    COUNT(CASE WHEN type = 'expense' AND original_amount != 0 THEN 1 END) as total_expense_count,
                    COALESCE(SUM(CASE WHEN type = 'income' AND original_amount != 0 THEN original_amount ELSE 0 END), 0) as total_original_income,
                    COALESCE(SUM(CASE WHEN type = 'income' AND original_amount != 0 THEN amount ELSE 0 END), 0) as total_income,
                    COALESCE(SUM(CASE WHEN type = 'expense' AND original_amount != 0 THEN ABS(amount) ELSE 0 END), 0) as total_expense
                FROM transactions 
                WHERE chat_id = ?`,
                [chat_id],
                (err, row) => {
                    if (err) {
                        console.error('❌ [ERROR] 获取总计统计失败:', err);
                        reject(err);
                    } else {
                        console.log(`✅ [SUCCESS] 获取总计统计成功:`, row);
                        resolve(row);
                    }
                }
            );
        });
    },

    addAdmin,
    removeAdmin,
    getAdmins,
    initDatabase,

    // 设置机器人所有者
    setBotOwner: (userId, addedBy = null) => {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO bot_owner (user_id, added_by) VALUES (?, ?)',
                [userId, addedBy],
                function(err) {
                    if (err) {
                        console.error('❌ [ERROR] 设置机器人所有者失败:', err);
                        reject(err);
                    } else {
                        console.log(`✅ [SUCCESS] 已设置用户 ${userId} 为机器人所有者`);
                        resolve(true);
                    }
                }
            );
        });
    },

    // 检查用户是否为机器人所有者
    isBotOwner: (userId) => {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT user_id FROM bot_owner WHERE user_id = ?',
                [userId],
                (err, row) => {
                    if (err) {
                        console.error('❌ [ERROR] 检查机器人所有者失败:', err);
                        reject(err);
                    } else {
                        resolve(!!row);
                    }
                }
            );
        });
    },

    // 获取所有机器人所有者信息
    getAllBotOwners: () => {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT o.user_id, o.created_at, o.added_by, 
                 (SELECT user_id FROM bot_owner WHERE user_id = o.added_by) as added_by_name
                 FROM bot_owner o
                 ORDER BY o.created_at ASC`,
                [],
                (err, rows) => {
                    if (err) {
                        console.error('❌ [ERROR] 获取机器人所有者列表失败:', err);
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                }
            );
        });
    },

    // 获取第一个机器人所有者信息
    getFirstBotOwner: () => {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT user_id, created_at FROM bot_owner ORDER BY created_at ASC LIMIT 1',
                [],
                (err, row) => {
                    if (err) {
                        console.error('❌ [ERROR] 获取第一个机器人所有者失败:', err);
                        reject(err);
                    } else {
                        resolve(row);
                    }
                }
            );
        });
    },

    // 检查记账功能是否启用
    isAccountingEnabled: (chatId) => {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT accounting_enabled FROM group_settings WHERE chat_id = ?',
                [chatId],
                (err, row) => {
                    if (err) {
                        console.error('查询记账功能状态失败:', err);
                        reject(err);
                        return;
                    }
                    // 如果没有记录，默认为未启用
                    resolve(row ? row.accounting_enabled === 1 : false);
                }
            );
        });
    },

    // 启用记账功能
    enableAccounting: (chatId) => {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO group_settings (chat_id, accounting_enabled)
                 VALUES (?, 1)
                 ON CONFLICT(chat_id) DO UPDATE SET
                 accounting_enabled = 1,
                 updated_at = CURRENT_TIMESTAMP`,
                [chatId],
                (err) => {
                    if (err) {
                        console.error('启用记账功能失败:', err);
                        reject(err);
                        return;
                    }
                    resolve();
                }
            );
        });
    },

    // 关闭记账功能
    disableAccounting: (chatId) => {
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE group_settings SET
                 accounting_enabled = 0,
                 updated_at = CURRENT_TIMESTAMP
                 WHERE chat_id = ?`,
                [chatId],
                (err) => {
                    if (err) {
                        console.error('关闭记账功能失败:', err);
                        reject(err);
                        return;
                    }
                    resolve();
                }
            );
        });
    }
};
