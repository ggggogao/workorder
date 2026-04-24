require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const { sequelize, Project, User, NotifyTemplate, SystemConfig } = require('./models');
const routes = require('./routes');
const { startCronJobs } = require('./jobs/cronJobs');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api', routes);
app.use(express.static(path.join(__dirname, '../public')));
app.get('/{*path}', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));
app.use((err, req, res, next) => res.status(500).json({ code: 500, message: '服务器内部错误' }));

// 首次启动自动初始化数据
async function seedIfEmpty() {
  const count = await User.count();
  if (count > 0) return;
  console.log('🌱 首次启动，初始化基础数据...');
  const PROJECTS = [
    { name: '慢病管理平台', code: 'CDP', owner: '张晓梅', owner_email: 'zhang@company.com' },
    { name: '术后康复追踪', code: 'PRT', owner: '李强', owner_email: 'li@company.com' },
    { name: '母婴健康服务', code: 'MHS', owner: '王芳', owner_email: 'wang@company.com' },
    { name: '心理援助专线', code: 'PSL', owner: '陈伟', owner_email: 'chen@company.com' },
    { name: '老年医护上门', code: 'EHV', owner: '刘敏', owner_email: 'liu@company.com' },
    { name: '企业健康体检', code: 'CHE', owner: '赵磊', owner_email: 'zhao@company.com' },
  ];
  for (const p of PROJECTS) await Project.findOrCreate({ where: { code: p.code }, defaults: p });

  const USERS = [
    { name: '系统管理员', email: 'admin@company.com', password: await bcrypt.hash('Admin123', 10), role: 'admin', dept: '技术部' },
    { name: '张晓梅', email: 'zhang@company.com', password: await bcrypt.hash('Abc12345', 10), role: 'manager', dept: '健康服务部' },
    { name: '李强', email: 'li@company.com', password: await bcrypt.hash('Abc12345', 10), role: 'manager', dept: '健康服务部' },
    { name: '王芳', email: 'wang@company.com', password: await bcrypt.hash('Abc12345', 10), role: 'agent', dept: '健康服务部' },
    { name: '陈伟', email: 'chen@company.com', password: await bcrypt.hash('Abc12345', 10), role: 'agent', dept: '健康服务部' },
    { name: '刘敏', email: 'liu@company.com', password: await bcrypt.hash('Abc12345', 10), role: 'agent', dept: '健康服务部' },
    { name: '赵磊', email: 'zhao@company.com', password: await bcrypt.hash('Abc12345', 10), role: 'agent', dept: '健康服务部' },
  ];
  for (const u of USERS) await User.findOrCreate({ where: { email: u.email }, defaults: u });

  await NotifyTemplate.findOrCreate({
    where: { key: 'daily_summary' },
    defaults: {
      key: 'daily_summary',
      subject: '【工单日报】{{date}} 未完结 {{total}} 件',
      greeting: '您好，以下是今日未完结工单汇总：',
      footer: '请及时跟进，确保在截止日期前完结。如有问题请联系项目负责人。',
      signature: '健康服务部工单系统 · 自动推送',
      show_project_detail: true,
      show_urgent_count: true,
    }
  });
  await SystemConfig.findOrCreate({ where: { key: 'notify_cron' }, defaults: { key: 'notify_cron', value: '30 8 * * 1-5', description: '每日触达cron' } });
  console.log('✅ 基础数据初始化完成');
}

async function bootstrap() {
  try {
    await sequelize.authenticate();
    console.log('✅ 数据库连接成功');
    await sequelize.sync({ alter: true });
    console.log('✅ 表结构同步完成');
    await seedIfEmpty();
    startCronJobs();
    app.listen(PORT, () => {
      console.log(`\n✅ 健康服务工单系统 v2.0 启动成功`);
      console.log(`   地址：http://localhost:${PORT}`);
      console.log(`   管理员账号：admin@company.com / Admin123\n`);
    });
  } catch (e) {
    console.error('❌ 启动失败：', e.message);
    process.exit(1);
  }
}

bootstrap();
