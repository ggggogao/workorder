require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const { sequelize, Project, User, WorkOrder, WorkOrderLog, NotifyTemplate, SystemConfig } = require('../models');

async function init() {
  console.log('🌱 初始化数据库...');
  await sequelize.authenticate();
  await sequelize.sync({ alter: true });
  console.log('✅ 表结构同步完成');

  // 项目
  const projects = await Promise.all([
    Project.findOrCreate({ where: { code: 'CDP' }, defaults: { name: '慢病管理平台', code: 'CDP', owner: '张晓梅', owner_email: 'zhang@company.com' } }),
    Project.findOrCreate({ where: { code: 'PRT' }, defaults: { name: '术后康复追踪', code: 'PRT', owner: '李强', owner_email: 'li@company.com' } }),
    Project.findOrCreate({ where: { code: 'MHS' }, defaults: { name: '母婴健康服务', code: 'MHS', owner: '王芳', owner_email: 'wang@company.com' } }),
    Project.findOrCreate({ where: { code: 'PSL' }, defaults: { name: '心理援助专线', code: 'PSL', owner: '陈伟', owner_email: 'chen@company.com' } }),
    Project.findOrCreate({ where: { code: 'EHV' }, defaults: { name: '老年医护上门', code: 'EHV', owner: '刘敏', owner_email: 'liu@company.com' } }),
    Project.findOrCreate({ where: { code: 'CHE' }, defaults: { name: '企业健康体检', code: 'CHE', owner: '赵磊', owner_email: 'zhao@company.com' } }),
  ]);
  console.log(`✅ 项目：${projects.length} 个`);

  // 用户
  const users = await Promise.all([
    User.findOrCreate({ where: { email: 'admin@company.com' }, defaults: { name: '系统管理员', email: 'admin@company.com', password: await bcrypt.hash('Admin123', 10), role: 'admin', dept: '技术部' } }),
    User.findOrCreate({ where: { email: 'zhang@company.com' }, defaults: { name: '张晓梅', email: 'zhang@company.com', password: await bcrypt.hash('Abc12345', 10), role: 'manager', dept: '健康服务部' } }),
    User.findOrCreate({ where: { email: 'li@company.com' }, defaults: { name: '李强', email: 'li@company.com', password: await bcrypt.hash('Abc12345', 10), role: 'manager', dept: '健康服务部' } }),
    User.findOrCreate({ where: { email: 'wang@company.com' }, defaults: { name: '王芳', email: 'wang@company.com', password: await bcrypt.hash('Abc12345', 10), role: 'agent', dept: '健康服务部' } }),
    User.findOrCreate({ where: { email: 'chen@company.com' }, defaults: { name: '陈伟', email: 'chen@company.com', password: await bcrypt.hash('Abc12345', 10), role: 'agent', dept: '健康服务部' } }),
    User.findOrCreate({ where: { email: 'liu@company.com' }, defaults: { name: '刘敏', email: 'liu@company.com', password: await bcrypt.hash('Abc12345', 10), role: 'agent', dept: '健康服务部' } }),
  ]);
  console.log(`✅ 用户：${users.length} 个`);

  // 默认通知模板
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
  console.log('✅ 默认通知模板已创建');

  // 系统配置
  await SystemConfig.findOrCreate({ where: { key: 'notify_cron' }, defaults: { key: 'notify_cron', value: '30 8 * * 1-5', description: '每日触达 cron 表达式' } });
  await SystemConfig.findOrCreate({ where: { key: 'system_name' }, defaults: { key: 'system_name', value: '健康服务工单管理系统', description: '系统名称' } });
  console.log('✅ 系统配置初始化完成');

  console.log('\n🎉 数据库初始化完成！');
  console.log('   管理员账号：admin@company.com');
  console.log('   管理员密码：Admin123');
  console.log('   业务人员密码：Abc12345');
}

init().then(() => process.exit(0)).catch(e => { console.error('❌', e.message); process.exit(1); });
