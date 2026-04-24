const cron = require('node-cron');
const WorkOrderService = require('../services/workOrderService');
const { sendNotify } = require('../services/emailService');
require('dotenv').config();

function startCronJobs() {
  const pattern = process.env.NOTIFY_CRON || '30 8 * * 1-5';
  console.log(`[Cron] 每日触达任务已启动，规则：${pattern}`);

  cron.schedule(pattern, async () => {
    console.log(`[Cron] ${new Date().toLocaleString('zh-CN')} 开始执行每日工单触达...`);
    try {
      const pending = await WorkOrderService.getPending();
      if (!pending.length) { console.log('[Cron] 暂无未完结工单，跳过'); return; }
      const channels = ['email'];
      if (process.env.WECOM_WEBHOOK_URL) channels.push('wecom');
      const results = await sendNotify(pending, channels, []);
      console.log(`[Cron] 触达完成，工单数：${pending.length}，结果：`, JSON.stringify(results));
    } catch (e) {
      console.error('[Cron] 触达任务出错：', e.message);
    }
  }, { timezone: 'Asia/Shanghai' });
}

module.exports = { startCronJobs };
