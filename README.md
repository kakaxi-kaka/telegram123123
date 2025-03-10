# Telegram 记账机器人

这是一个帮助用户进行 CNY 与 USDT 之间转换记账的 Telegram 机器人。

## 功能特性

### 1. 汇率管理
- 设置汇率：设置汇率[数值]（例如：设置汇率7.35）
- 设置费率：设置费率[数值]（例如：设置费率20）
- 设置日切：设置日切[时间]（例如：设置日切00:00）
- 手动日切：/daycut（立即执行日切操作）

### 2. 记账功能
- 快速记账：+金额（使用存储的汇率）
- 指定汇率记账：+金额/汇率（例如：+100/7.35）
- 修正记录：^金额 或 金额/汇率（例如：-100/7.35）
- 下发：下发[金额]（例如：下发-100）

### 3. 查询功能
- 查询余额：'余额'
- 查看账单汇总：'汇总'
- 查询火币汇率：'20'或'20'
- 计算器：直接输入算式（例如：1+2*3）
- 查看用户信息：'id'（直接发送或回复他人消息）
- 查看交易记录：'/web'（网页版）

### 4. 管理功能
- 设置机器人所有者：'/setowner'
- 添加机器人所有者：'/addowner @用户名'
- 查看所有者列表：'/owner'
- 添加群组操作权限：'/addgroup'
- 删除用户消息：回复要删除的用户消息并发送删除操作员 @用户名
- 添加操作员：添加操作员 @用户名（例如：添加操作员 5760241603）
- 使用用户名：添加操作员 @用户名
- 移除操作员：回复消息：回复要移除的用户消息并发送移除操作员
- 使用ID：移除操作员 用户ID（例如：移除操作员 5760241603）
- 使用用户名：移除操作员 @用户名
- 查看操作员列表：操作员（显示当前群组的操作员）

### 5. 计算工具
- 费率计算：计算费率[币价][汇率]（例如：计算费率7.30 7.35）
- 汇率计算：计算汇率[币价][费率]（例如：计算汇率7.30 20）

## 使用说明
1. 首次使用需要设置汇率和费率：
   - 设置汇率7.35 设置费率20
2. 记账说明：
   - +100/7.35 # 添加最近一笔 100 CNY 的收入记录
   - -100/7.35 # 删除最近一笔使用 7.35 汇率的 100 CNY 收入记录
   - 下发 -100 # 删除最近一笔 100 USDT 的下发记录
3. 查看账单汇总：
   - "汇总" 显示：
     - 已入账记录列表
     - 已下发金额
     - 未下发金额
     - 总入账额
     - 当前费率
     - 当前汇率
4. 使用计算器：
   - 1+2*3 # 基本运算
   - 100/7.35 # 除法运算
   - (1+2)*3 # 带括号运算

## 技术架构
- Node.js + Telegram + SQLite 数据库
- 模块化设计 + 开发计划
- [] 添加更多记录功能
- [] 添加数据导出功能
- [] 添加数据导出功能
- [] 支持多种转账

## 部署说明

### 1. 系统要求
- Node.js 16+ 
- MySQL 5.7+
- PM2 (用于进程管理)

### 2. 安装步骤
1. 克隆代码到服务器
```bash
git clone [你的仓库地址]
cd telegram-account-bot
```

2. 安装依赖
```bash
npm install
```

3. 配置环境变量
- 复制 `.env.example` 文件为 `.env`
- 开填写以下配置：
  - BOT_TOKEN=你的Telegram机器人令牌
  - DB_HOST=数据库用户名
  - DB_USER=数据库用户名
  - DB_NAME=数据库名称
  - DB_PASSWORD=数据库密码
  - SERVER_URL=你的服务器URL(https)

4. 初始化数据库
```bash
node setup-database.js
```

5. 使用PM2启动服务
```bash
# 安装PM2
npm install -g pm2
# 启动机器人服务
pm2 start index.js --name telegram-bot
# 启动Web服务
pm2 start web.js --name telegram-web
# 保存PM2配置
pm2 save
# 设置开机启动
pm2 startup
```

### 3. 更新部署
1. 拉取最新代码
```bash
git pull origin main
```

2. 安装依赖
```bash
npm install
```

3. 重启服务
```bash
pm2 restart telegram-bot telegram-web
```

### 4. 常用命令
- 查看日志：
```bash
pm2 logs telegram-bot
pm2 logs telegram-web
```
- 查看服务状态：
```bash
pm2 status
```
- 停止服务：
```bash
pm2 stop telegram-bot telegram-web
```

### 5. 故障排查
1. 检查日志
```bash
pm2 logs telegram-bot --lines 100
```

2. 检查数据库连接
```bash
node database-test.js
```

3. 常见问题：
- 如果机器人无响应，检查 BOT TOKEN 是否正确
- 如果数据库连接失败，检查数据库配置和防火墙设置
- 如果web服务无法访问，检查 SERVER_URL 配置和SSL证书

### 6. 安全建议
1. 使用强密码
2. 定期更新系统和依赖包
3. 配置防火墙，只开放必要端口
4. 定期备份数据库
5. 使用HTTPS协议确保安全

### 7. 备份说明
1. 数据库备份
```bash
# 创建备份
mysqldump -u [用户名] -p [数据库名] > backup.sql
# 恢复备份
mysql -u [用户名] -p [数据库名] < backup.sql
```

2. 配置文件备份
- 定期备份 .env 文件
- 保存 PM2 配置

如有问题请联系系统本支持。

# telegram