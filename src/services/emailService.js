const axios = require('axios');
const dayjs = require('dayjs');
const { NotifyLog, NotifyTemplate } = require('../models');
require('dotenv').config();

async function getTemplate() {
  try {
    const { NotifyTemplate } = require('../models');
    const tpl = await NotifyTemplate.findOne({ where: { key: 'daily_summary' } });
    if (tpl) return tpl.dataValues || tpl;
  } catch (e) {}
  return {
    subject: '【工单日报】{{date}} 未完结 {{total}} 件',
    greeting: '您好，以下是今日未完结工单汇总：',
    footer: '请及时跟进，确保在截止日期前完结。',
    signature: '健康服务部工单系统 · 自动推送',
    show_project_detail: true,
    show_urgent_count: true,
  };
}

async function sendEmailViaResend(pendingOrders, recipients = []) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !apiKey.startsWith('re_')) {
    return { success: false, error: 'Resend API Key 未配置（需以 re_ 开头）' };
  }

  const tpl = await getTemplate();
  const today = dayjs().format('YYYY年MM月DD日');
  const urgentCount = pendingOrders.filter(o => o.priority === 'urgent').length;
  const overdueCount = pendingOrders.filter(o =>
    o.deadline && dayjs(o.deadline).isBefore(dayjs(), 'day')
  ).length;

  const byProject = {};
  pendingOrders.forEach(o => {
    const name = o.project?.name || '未知项目';
    byProject[name] = (byProject[name] || 0) + 1;
  });

  const subject = (tpl.subject || '【工单日报】{{date}} 未完结 {{total}} 件')
    .replace('{{date}}', today).replace('{{total}}', pendingOrders.length);

  const sysUrl = process.env.SYSTEM_URL || 'https://web-production-de3e3.up.railway.app';

  // 按项目分组，并附带工单列表
  const projectOrderMap = {};
  pendingOrders.forEach(o => {
    const name = o.project?.name || '未知项目';
    if (!projectOrderMap[name]) projectOrderMap[name] = [];
    projectOrderMap[name].push(o);
  });

  const projectRows = tpl.show_project_detail
    ? Object.entries(projectOrderMap).map(([p, orders]) => {
        const overdueOrders = orders.filter(o => o.deadline && dayjs(o.deadline).isBefore(dayjs(), 'day'));
        const urgentOrders = orders.filter(o => o.priority === 'urgent');
        const orderLinks = orders.slice(0, 5).map(o => `
          <tr style="background:#fafbfc">
            <td style="padding:6px 16px 6px 28px;border-bottom:1px solid #f5f6f7;font-size:12px;color:#646a73">
              <a href="${sysUrl}/#orders?id=${o.id}" style="color:#3370ff;text-decoration:none;font-weight:500">${o.order_no}</a>
              <span style="color:#9ea6b4;margin:0 6px">·</span>${o.customer_name}
              <span style="color:#9ea6b4;margin:0 6px">·</span>${o.issue_type}
            </td>
            <td style="padding:6px 16px;border-bottom:1px solid #f5f6f7;font-size:12px;text-align:center">
              ${o.priority === 'urgent' ? '<span style="background:#fff1f0;color:#f54a45;padding:1px 6px;border-radius:3px;font-size:11px">紧急</span>' : o.priority === 'high' ? '<span style="background:#fff4e5;color:#ff8800;padding:1px 6px;border-radius:3px;font-size:11px">高</span>' : '<span style="background:#f0f1f3;color:#646a73;padding:1px 6px;border-radius:3px;font-size:11px">普通</span>'}
            </td>
            <td style="padding:6px 16px;border-bottom:1px solid #f5f6f7;font-size:12px;text-align:center;color:${o.deadline && dayjs(o.deadline).isBefore(dayjs(), 'day') ? '#f54a45' : '#9ea6b4'}">${o.deadline || '—'}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #f5f6f7;text-align:center">
              <a href="${sysUrl}/#orders?id=${o.id}" style="background:#3370ff;color:#fff;padding:3px 10px;border-radius:4px;font-size:11px;text-decoration:none;display:inline-block">处理 →</a>
            </td>
          </tr>`).join('');
        const moreCount = orders.length > 5 ? orders.length - 5 : 0;
        return `
        <tr style="background:#f0f4ff">
          <td colspan="4" style="padding:10px 16px">
            <div style="display:flex;align-items:center;justify-content:space-between">
              <span style="font-weight:600;color:#1f2329;font-size:13px">📁 ${p}</span>
              <div style="display:flex;gap:8px;align-items:center">
                ${urgentOrders.length > 0 ? `<span style="background:#fff1f0;color:#f54a45;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500">紧急 ${urgentOrders.length}</span>` : ''}
                ${overdueOrders.length > 0 ? `<span style="background:#fff4e5;color:#ff8800;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500">超时 ${overdueOrders.length}</span>` : ''}
                <span style="color:#f54a45;font-weight:700;font-size:13px">${orders.length} 件</span>
                <a href="${sysUrl}/#orders?proj=${encodeURIComponent(p)}" style="background:#3370ff;color:#fff;padding:3px 10px;border-radius:4px;font-size:11px;text-decoration:none">查看全部 →</a>
              </div>
            </div>
          </td>
        </tr>
        ${orderLinks}
        ${moreCount > 0 ? `<tr><td colspan="4" style="padding:6px 16px;text-align:center;font-size:12px;color:#9ea6b4"><a href="${sysUrl}/#orders" style="color:#3370ff">还有 ${moreCount} 件，点击查看全部 →</a></td></tr>` : ''}`;
      }).join('') : '';

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f7f8fa;font-family:-apple-system,'PingFang SC',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fa;padding:32px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <tr><td style="background:#3370ff;padding:24px 28px">
    <div style="color:#fff;font-size:18px;font-weight:600">健康服务部 · 工单处理日报</div>
    <div style="color:rgba(255,255,255,.8);font-size:13px;margin-top:6px">${today} · 系统自动推送</div>
  </td></tr>
  <tr><td style="padding:24px 28px 0">
    <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td width="30%" style="text-align:center;padding:16px;background:#fff1f0;border-radius:8px">
        <div style="font-size:32px;font-weight:700;color:#f54a45">${pendingOrders.length}</div>
        <div style="font-size:12px;color:#9ea6b4;margin-top:4px">未完结工单</div>
      </td>
      <td width="5%"></td>
      <td width="30%" style="text-align:center;padding:16px;background:#fff4e5;border-radius:8px">
        <div style="font-size:32px;font-weight:700;color:#ff8800">${urgentCount}</div>
        <div style="font-size:12px;color:#9ea6b4;margin-top:4px">紧急工单</div>
      </td>
      <td width="5%"></td>
      <td width="30%" style="text-align:center;padding:16px;background:#fff1f0;border-radius:8px">
        <div style="font-size:32px;font-weight:700;color:#f54a45">${overdueCount}</div>
        <div style="font-size:12px;color:#9ea6b4;margin-top:4px">已超时</div>
      </td>
    </tr>
    </table>
  </td></tr>
  <tr><td style="padding:20px 28px 0;font-size:14px;color:#1f2329;line-height:1.7">
    ${tpl.greeting || '您好，以下是今日未完结工单汇总：'}
  </td></tr>
  ${tpl.show_project_detail ? `
  <tr><td style="padding:16px 28px 0">
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8eaed;border-radius:8px;overflow:hidden;font-size:13px">
      <thead><tr style="background:#fafbfc">
        <th style="padding:10px 16px;text-align:left;color:#9ea6b4;font-weight:500;border-bottom:1px solid #e8eaed">工单号 / 客户 / 类型</th>
        <th style="padding:10px 16px;text-align:center;color:#9ea6b4;font-weight:500;border-bottom:1px solid #e8eaed">优先级</th>
        <th style="padding:10px 16px;text-align:center;color:#9ea6b4;font-weight:500;border-bottom:1px solid #e8eaed">截止日期</th>
        <th style="padding:10px 16px;text-align:center;color:#9ea6b4;font-weight:500;border-bottom:1px solid #e8eaed">操作</th>
      </tr></thead>
      <tbody>${projectRows}</tbody>
    </table>
  </td></tr>` : ''}
  <tr><td style="padding:20px 28px;font-size:13px;color:#646a73;line-height:1.8;border-top:1px solid #f0f1f3;margin-top:20px">
    <p style="margin:0 0 8px">${tpl.footer || '请及时跟进，确保在截止日期前完结。'}</p>
    <p style="margin:0;color:#9ea6b4;font-size:12px">— ${tpl.signature || '健康服务部工单系统 · 自动推送'}</p>
    <div style="margin-top:16px;text-align:center">
      <a href="${sysUrl}" style="background:#3370ff;color:#fff;padding:10px 28px;border-radius:8px;font-size:13px;font-weight:500;text-decoration:none;display:inline-block">🔗 打开工单系统，立即处理</a>
    </div>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const emailList = [...new Set([
    ...(process.env.NOTIFY_EMAILS || '').split(',').filter(Boolean),
    ...recipients,
  ])];
  if (!emailList.length) return { success: false, error: '未配置收件人邮箱' };

  try {
    // Resend 免费版必须用 onboarding@resend.dev 作为发件人（除非验证自己的域名）
    // 如已在 resend.com 验证域名，可将 MAIL_FROM 改为自己的邮箱
    const fromEmail = process.env.MAIL_FROM_VERIFIED === 'true'
      ? (process.env.MAIL_FROM || 'onboarding@resend.dev')
      : 'onboarding@resend.dev';
    const fromName = process.env.MAIL_FROM_NAME || '健康服务工单系统';

    const res = await axios.post('https://api.resend.com/emails', {
      from: `${fromName} <${fromEmail}>`,
      to: emailList,
      subject,
      html,
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    console.log(`[Email] Resend 发送成功 -> ${emailList.join(',')}`);
    return { success: true, recipients: emailList, id: res.data.id };
  } catch (e) {
    const errMsg = e.response?.data?.message || e.message;
    console.error('[Email] Resend 发送失败:', errMsg);
    return { success: false, error: errMsg };
  }
}

async function sendWecom(pendingOrders) {
  const webhookUrl = process.env.WECOM_WEBHOOK_URL;
  if (!webhookUrl) return { success: false, error: 'Webhook未配置' };
  const today = dayjs().format('MM月DD日');
  const byProject = {};
  pendingOrders.forEach(o => { const n = o.project?.name || '未知'; byProject[n] = (byProject[n] || 0) + 1; });
  const lines = Object.entries(byProject).map(([p, c]) => `> **${p}**：${c} 件`).join('\n');
  const urgentCount = pendingOrders.filter(o => o.priority === 'urgent').length;
  const overdueCount = pendingOrders.filter(o => o.deadline && dayjs(o.deadline).isBefore(dayjs(), 'day')).length;
  try {
    const res = await axios.post(webhookUrl, {
      msgtype: 'markdown',
      markdown: { content: `## 📋 工单日报 · ${today}\n\n${lines}\n\n---\n**未完结合计：<font color="warning">${pendingOrders.length} 件</font>**${urgentCount > 0 ? `\n**紧急：<font color="warning">${urgentCount} 件</font>**` : ''}${overdueCount > 0 ? `\n**超时：<font color="comment">${overdueCount} 件</font>** ⚠️` : ''}` }
    }, { timeout: 8000 });
    return { success: res.data.errcode === 0 };
  } catch (e) { return { success: false, error: e.message }; }
}

async function sendNotify(pendingOrders, channels = ['email'], recipients = []) {
  const results = {};
  const now = new Date();
  for (const ch of channels) {
    let result;
    if (ch === 'email') result = await sendEmailViaResend(pendingOrders, recipients);
    else if (ch === 'wecom') result = await sendWecom(pendingOrders);
    else result = { success: false, error: '未知渠道' };
    results[ch] = result;
    try {
      await NotifyLog.create({
        channel: ch, notify_type: 'daily_summary',
        recipients: JSON.stringify(recipients),
        pending_count: pendingOrders.length,
        status: result.success ? 'success' : 'failed',
        error_msg: result.error || null,
        sent_at: now,
      });
    } catch (e) { console.error('[NotifyLog]', e.message); }
  }
  return results;
}

module.exports = { sendNotify, sendEmailViaResend, sendWecom };
