require('dotenv').config();
const db = require('./database');

async function testDatabaseConnection() {
    try {
        // 测试数据库连接
        console.log('正在测试数据库连接...');
        await db.testConnection();
        console.log('✅ 数据库连接成功！');

        // 测试基本查询
        console.log('\n正在测试基本查询...');
        const result = await db.query('SELECT NOW() as current_time');
        console.log('✅ 查询成功！当前数据库时间:', result[0].current_time);

        // 测试表是否存在
        console.log('\n正在检查必要的数据表...');
        const tables = ['group_settings', 'transactions', 'administrators'];
        for (const table of tables) {
            const tableExists = await db.query(
                'SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
                [process.env.DB_NAME, table]
            );
            if (tableExists[0].count > 0) {
                console.log(`✅ 表 ${table} 存在`);
            } else {
                console.log(`❌ 表 ${table} 不存在`);
            }
        }

        console.log('\n数据库测试完成！');
        process.exit(0);
    } catch (error) {
        console.error('❌ 数据库测试失败:', error);
        process.exit(1);
    }
}

testDatabaseConnection(); 