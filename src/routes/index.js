const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dayjs = require('dayjs');
const WorkOrderService = require('../services/workOrderService');
const { sendNotify } = require('../services/emailService');
const { Project, User, WorkOrder, NotifyLog, NotifyTemplate, SystemConfig } = require('../models');
const { Op } = require('sequelize');

const SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_prod';

// ===== 中间件 =====
const auth = (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ code: 401, message: '未登录' });
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch { res.status(401).json({ code: 401, message: 'Token已过期' }); }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ code: 403, message: '权限不足' });
  next();
};

// 外部系统API密钥鉴权（用于业务系统同步工单）
const apiKeyAuth = (req, res, next) => {
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (key && key === process.env.EXTERNAL_API_KEY) { req.isExternal = true; return next(); }
  return auth(req, res, next);
};

// ===== 健康检查 =====
router.get('/health', (req, res) => res.json({ code: 0, status: 'ok', version: '2.0.0', time: new Date().toISOString() }));

// ===== 认证 =====
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email, is_active: true } });
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ code: 401, message: '邮箱或密码错误' });
    await user.update({ last_login_at: new Date() });
    const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, SECRET, { expiresIn: '7d' });
    res.json({ code: 0, data: { token, user: { id: user.id, name: user.name, email: user.email, role: user.role, dept: user.dept } } });
  } catch (e) { res.status(500).json({ code: 500, message: e.message }); }
});

// ===== 工单 =====
router.get('/workorders', auth, async (req, res) => {
  try { res.json({ code: 0, data: await WorkOrderService.list(req.query) }); }
  catch (e) { res.status(500).json({ code: 500, message: e.message }); }
});

router.get('/workorders/summary', auth, async (req, res) => {
  try { res.json({ code: 0, data: await WorkOrderService.getSummary() }); }
  catch (e) { res.status(500).json({ code: 500, message: e.message }); }
});

router.get('/workorders/project-stats', auth, async (req, res) => {
  try { res.json({ code: 0, data: await WorkOrderService.getProjectStats() }); }
  catch (e) { res.status(500).json({ code: 500, message: e.message }); }
});

router.get('/workorders/status-distribution', auth, async (req, res) => {
  try { res.json({ code: 0, data: await WorkOrderService.getStatusDist() }); }
  catch (e) { res.status(500).json({ code: 500, message: e.message }); }
});

router.get('/workorders/trend', auth, async (req, res) => {
  try { res.json({ code: 0, data: await WorkOrderService.getTrend() }); }
  catch (e) { res.status(500).json({ code: 500, message: e.message }); }
});

router.get('/workorders/:id', auth, async (req, res) => {
  try {
    const order = await WorkOrderService.getDetail(req.params.id);
    if (!order) return res.status(404).json({ code: 404, message: '工单不存在' });
    res.json({ code: 0, data: order });
  } catch (e) { res.status(500).json({ code: 500, message: e.message }); }
});

router.post('/workorders', auth, async (req, res) => {
  try {
    const { order, created } = await WorkOrderService.create(req.body, req.user.id);
    res.status(created ? 201 : 200).json({ code: 0, data: order, message: created ? '创建成功' : '工单已存在（已去重）' });
  } catch (e) { res.status(400).json({ code: 400, message: e.message }); }
});

router.put('/workorders/:id', auth, async (req, res) => {
  try {
    const order = await WorkOrderService.update(req.params.id, req.body, req.user.id);
    res.json({ code: 0, data: order, message: '更新成功' });
  } catch (e) { res.status(400).json({ code: 400, message: e.message }); }
});

router.patch('/workorders/:id/status', auth, async (req, res) => {
  try {
    const { status, remark } = req.body;
    const order = await WorkOrderService.updateStatus(req.params.id, status, req.user.id, remark);
    res.json({ code: 0, data: order, message: '状态更新成功' });
  } catch (e) { res.status(400).json({ code: 400, message: e.message }); }
});

// ===== 外部系统同步接口（使用 API Key 鉴权）=====
router.post('/external/sync', apiKeyAuth, async (req, res) => {
  try {
    const orders = Array.isArray(req.body) ? req.body : [req.body];
    const results = [];
    for (const item of orders) {
      // 必须提供 external_id 防止重复
      if (!item.external_id) { results.push({ error: '缺少 external_id', item }); continue; }
      // 查找项目
      let project = null;
      if (item.project_code) project = await Project.findOne({ where: { code: item.project_code } });
      if (!project && item.project_id) project = await Project.findByPk(item.project_id);
      if (!project) { results.push({ error: `找不到项目: ${item.project_code || item.project_id}`, item }); continue; }

      const { order, created } = await WorkOrderService.create({
        project_id: project.id,
        customer_name: item.customer_name || item.customerName || '未知客户',
        customer_phone: item.customer_phone || item.phone || '',
        customer_id: item.customer_id || item.memberId || '',
        issue_type: item.issue_type || item.issueType || '其他',
        title: item.title || item.subject || '外部系统工单',
        description: item.description || item.content || '',
        status: item.status || 'pending',
        priority: item.priority || 'normal',
        source: 'api',
        deadline: item.deadline || null,
        external_id: item.external_id,
        external_source: item.external_source || 'external',
        remark: item.remark || '',
      }, null);
      results.push({ order_no: order.order_no, created, external_id: item.external_id });
    }
    res.json({ code: 0, data: results, message: `处理 ${orders.length} 条，成功 ${results.filter(r => !r.error).length} 条` });
  } catch (e) { res.status(500).json({ code: 500, message: e.message }); }
});

// ===== 通知 =====
router.get('/notify/preview', auth, async (req, res) => {
  try {
    const pending = await WorkOrderService.getPending();
    const today = dayjs().format('YYYY-MM-DD');
    const byProject = {};
    pending.forEach(o => { const n = o.project?.name || '未知'; byProject[n] = (byProject[n] || 0) + 1; });
    res.json({ code: 0, data: {
      totalPending: pending.length,
      urgentCount: pending.filter(o => o.priority === 'urgent').length,
      overdueCount: pending.filter(o => o.deadline && o.deadline < today).length,
      byProject,
    }});
  } catch (e) { res.status(500).json({ code: 500, message: e.message }); }
});

router.post('/notify/send', auth, async (req, res) => {
  try {
    const pending = await WorkOrderService.getPending();
    if (!pending.length) return res.json({ code: 0, message: '暂无未完结工单', data: { pendingCount: 0 } });
    const { channels = ['email'], recipients = [] } = req.body;
    const results = await sendNotify(pending, channels, recipients);
    res.json({ code: 0, message: '通知已发送', data: { pendingCount: pending.length, results } });
  } catch (e) { res.status(500).json({ code: 500, message: e.message }); }
});

router.get('/notify/logs', auth, async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const { count, rows } = await NotifyLog.findAndCountAll({
      order: [['sent_at', 'DESC']],
      limit: parseInt(pageSize),
      offset: (parseInt(page) - 1) * parseInt(pageSize),
    });
    res.json({ code: 0, data: { total: count, list: rows } });
  } catch (e) { res.status(500).json({ code: 500, message: e.message }); }
});

router.get('/notify/template', auth, async (req, res) => {
  try {
    let tpl = await NotifyTemplate.findOne({ where: { key: 'daily_summary' } });
    if (!tpl) tpl = { subject: '【工单日报】{{date}} 未完结 {{total}} 件', greeting: '您好，以下是今日未完结工单汇总：', footer: '请及时跟进，确保在截止日期前完结。', signature: '健康服务部工单系统 · 自动推送', show_project_detail: true, show_urgent_count: true };
    res.json({ code: 0, data: tpl });
  } catch (e) { res.status(500).json({ code: 500, message: e.message }); }
});

router.put('/notify/template', auth, async (req, res) => {
  try {
    const [tpl] = await NotifyTemplate.findOrCreate({ where: { key: 'daily_summary' }, defaults: { key: 'daily_summary', ...req.body } });
    await tpl.update(req.body);
    res.json({ code: 0, data: tpl, message: '模板已保存' });
  } catch (e) { res.status(500).json({ code: 500, message: e.message }); }
});

// ===== 项目 =====
router.get('/projects', auth, async (req, res) => {
  const projects = await Project.findAll({ where: { status: 'active' }, order: [['name', 'ASC']] });
  res.json({ code: 0, data: projects });
});

router.post('/projects', auth, async (req, res) => {
  try {
    const p = await Project.create(req.body);
    res.status(201).json({ code: 0, data: p });
  } catch (e) { res.status(400).json({ code: 400, message: e.message }); }
});

// ===== 用户 =====
router.get('/users', auth, async (req, res) => {
  const users = await User.findAll({ attributes: { exclude: ['password'] }, order: [['name', 'ASC']] });
  res.json({ code: 0, data: users });
});

router.get('/users/me', auth, async (req, res) => {
  const user = await User.findByPk(req.user.id, { attributes: { exclude: ['password'] } });
  res.json({ code: 0, data: user });
});

router.put('/users/me', auth, async (req, res) => {
  try {
    const allowed = ['name', 'phone', 'wecom_id', 'dept', 'notify_daily', 'notify_overdue', 'notify_urgent'];
    const data = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) data[k] = req.body[k]; });
    await User.update(data, { where: { id: req.user.id } });
    const user = await User.findByPk(req.user.id, { attributes: { exclude: ['password'] } });
    res.json({ code: 0, data: user, message: '个人信息已更新' });
  } catch (e) { res.status(400).json({ code: 400, message: e.message }); }
});

router.put('/users/me/password', auth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findByPk(req.user.id);
    if (!(await bcrypt.compare(oldPassword, user.password)))
      return res.status(400).json({ code: 400, message: '当前密码错误' });
    await user.update({ password: await bcrypt.hash(newPassword, 10) });
    res.json({ code: 0, message: '密码修改成功' });
  } catch (e) { res.status(400).json({ code: 400, message: e.message }); }
});

router.post('/users', auth, adminOnly, async (req, res) => {
  try {
    const { password, ...rest } = req.body;
    const user = await User.create({ ...rest, password: await bcrypt.hash(password || 'Abc12345', 10) });
    res.status(201).json({ code: 0, data: { id: user.id, name: user.name, email: user.email, role: user.role }, message: '创建成功' });
  } catch (e) { res.status(400).json({ code: 400, message: e.message }); }
});

router.patch('/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const allowed = ['name', 'phone', 'wecom_id', 'dept', 'role', 'is_active', 'notify_daily', 'notify_overdue'];
    const data = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) data[k] = req.body[k]; });
    await User.update(data, { where: { id: req.params.id } });
    res.json({ code: 0, message: '更新成功' });
  } catch (e) { res.status(400).json({ code: 400, message: e.message }); }
});

module.exports = router;
