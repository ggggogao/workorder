const { WorkOrder, Project, User, WorkOrderLog } = require('../models');
const { Op, fn, col } = require('sequelize');
const sequelize = require('../database');
const dayjs = require('dayjs');

const PRI_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };

function prioritySort(a, b) {
  return (PRI_ORDER[a.priority] || 2) - (PRI_ORDER[b.priority] || 2);
}

class WorkOrderService {
  static async generateNo() {
    const prefix = 'WO' + dayjs().format('YYYYMMDD');
    const latest = await WorkOrder.findOne({
      where: { order_no: { [Op.like]: `${prefix}%` } },
      order: [['order_no', 'DESC']],
    });
    const seq = latest
      ? String(parseInt(latest.order_no.slice(-4)) + 1).padStart(4, '0')
      : '0001';
    return prefix + seq;
  }

  static async create(data, operatorId) {
    if (data.external_id && data.external_source) {
      const exists = await WorkOrder.findOne({
        where: { external_id: data.external_id, external_source: data.external_source },
      });
      if (exists) return { order: exists, created: false };
    }
    const order_no = await this.generateNo();
    const order = await WorkOrder.create({ ...data, order_no });
    await WorkOrderLog.create({
      work_order_id: order.id, operator_id: operatorId,
      action: 'create', to_status: order.status,
      content: data.source === 'api' ? `外部系统同步（${data.external_source || 'api'}）` : '手动创建',
    });
    return { order, created: true };
  }

  static async list({ page = 1, pageSize = 20, projectId, status, priority,
    assigneeId, keyword, overdueOnly, dateFrom, dateTo } = {}) {
    const where = {};
    const today = dayjs().format('YYYY-MM-DD');
    if (projectId) where.project_id = projectId;
    if (status) where.status = Array.isArray(status) ? { [Op.in]: status } : status;
    if (priority) where.priority = priority;
    if (assigneeId) where.assignee_id = assigneeId;
    if (keyword) where[Op.or] = [
      { order_no: { [Op.like]: `%${keyword}%` } },
      { customer_name: { [Op.like]: `%${keyword}%` } },
      { customer_phone: { [Op.like]: `%${keyword}%` } },
      { title: { [Op.like]: `%${keyword}%` } },
    ];
    if (overdueOnly === 'true') {
      where.deadline = { [Op.lt]: today };
      where.status = { [Op.notIn]: ['done', 'cancelled'] };
    }
    if (dateFrom) where.created_at = { ...(where.created_at||{}), [Op.gte]: dayjs(dateFrom).startOf('day').toDate() };
    if (dateTo) where.created_at = { ...(where.created_at||{}), [Op.lte]: dayjs(dateTo).endOf('day').toDate() };

    const { count, rows } = await WorkOrder.findAndCountAll({
      where,
      include: [
        { model: Project, as: 'project', attributes: ['id', 'name', 'code'] },
        { model: User, as: 'assignee', attributes: ['id', 'name', 'email'] },
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(pageSize),
      offset: (parseInt(page) - 1) * parseInt(pageSize),
    });

    return {
      total: count, page: parseInt(page), pageSize: parseInt(pageSize),
      totalPages: Math.ceil(count / parseInt(pageSize)),
      list: rows,
    };
  }

  static async getPending() {
    const orders = await WorkOrder.findAll({
      where: { status: { [Op.notIn]: ['done', 'cancelled'] } },
      include: [
        { model: Project, as: 'project', attributes: ['id', 'name'] },
        { model: User, as: 'assignee', attributes: ['id', 'name', 'email'] },
      ],
      order: [['deadline', 'ASC'], ['created_at', 'DESC']],
    });
    return orders.sort(prioritySort);
  }

  static async getDetail(id) {
    return WorkOrder.findByPk(id, {
      include: [
        { model: Project, as: 'project' },
        { model: User, as: 'assignee', attributes: ['id', 'name', 'email'] },
        { model: WorkOrderLog, as: 'logs',
          include: [{ model: User, as: 'operator', attributes: ['id', 'name'] }],
          order: [['created_at', 'DESC']] },
      ],
    });
  }

  static async updateStatus(id, newStatus, operatorId, remark = '') {
    const order = await WorkOrder.findByPk(id);
    if (!order) throw new Error('工单不存在');
    const fromStatus = order.status;
    await order.update({ status: newStatus, ...(newStatus === 'done' ? { resolved_at: new Date() } : {}) });
    await WorkOrderLog.create({
      work_order_id: id, operator_id: operatorId,
      action: 'status_change', from_status: fromStatus, to_status: newStatus,
      content: remark || `状态变更：${fromStatus} → ${newStatus}`,
    });
    return order.reload();
  }

  static async update(id, data, operatorId) {
    const order = await WorkOrder.findByPk(id);
    if (!order) throw new Error('工单不存在');
    await order.update(data);
    await WorkOrderLog.create({ work_order_id: id, operator_id: operatorId, action: 'update', content: '更新工单信息' });
    return this.getDetail(id);
  }

  static async getSummary() {
    const today = dayjs().format('YYYY-MM-DD');
    const [total, done, pending, todayNew, overdue] = await Promise.all([
      WorkOrder.count(),
      WorkOrder.count({ where: { status: 'done' } }),
      WorkOrder.count({ where: { status: { [Op.notIn]: ['done', 'cancelled'] } } }),
      WorkOrder.count({ where: { created_at: { [Op.gte]: dayjs().startOf('day').toDate() } } }),
      WorkOrder.count({ where: { deadline: { [Op.lt]: today }, status: { [Op.notIn]: ['done', 'cancelled'] } } }),
    ]);
    const resolved = await WorkOrder.findAll({ where: { status: 'done', resolved_at: { [Op.ne]: null } }, attributes: ['created_at', 'resolved_at'] });
    let avgDays = 0;
    if (resolved.length) {
      const totalMs = resolved.reduce((s, o) => s + (new Date(o.resolved_at) - new Date(o.created_at)), 0);
      avgDays = +(totalMs / resolved.length / 86400000).toFixed(1);
    }
    return { total, done, pending, todayNew, overdue, avgDays, doneRate: total > 0 ? +((done / total) * 100).toFixed(1) : 0 };
  }

  static async getProjectStats() {
    const projects = await Project.findAll({ where: { status: 'active' } });
    const today = dayjs().format('YYYY-MM-DD');
    return Promise.all(projects.map(async p => {
      const [total, done, pending, overdue] = await Promise.all([
        WorkOrder.count({ where: { project_id: p.id } }),
        WorkOrder.count({ where: { project_id: p.id, status: 'done' } }),
        WorkOrder.count({ where: { project_id: p.id, status: { [Op.notIn]: ['done', 'cancelled'] } } }),
        WorkOrder.count({ where: { project_id: p.id, deadline: { [Op.lt]: today }, status: { [Op.notIn]: ['done', 'cancelled'] } } }),
      ]);
      return { project: { id: p.id, name: p.name, owner: p.owner }, total, done, pending, overdue, doneRate: total > 0 ? +((done / total) * 100).toFixed(1) : 0 };
    }));
  }

  static async getStatusDist() {
    const results = await WorkOrder.findAll({
      attributes: ['status', [fn('COUNT', col('id')), 'count']],
      group: ['status'], raw: true,
    });
    return results.map(r => ({ status: r.status, count: parseInt(r.count) }));
  }

  static async getTrend() {
    const days = Array.from({ length: 7 }, (_, i) => dayjs().subtract(6 - i, 'day').format('YYYY-MM-DD'));
    return Promise.all(days.map(async day => ({
      date: day,
      created: await WorkOrder.count({ where: { created_at: { [Op.gte]: dayjs(day).startOf('day').toDate(), [Op.lte]: dayjs(day).endOf('day').toDate() } } }),
      resolved: await WorkOrder.count({ where: { resolved_at: { [Op.gte]: dayjs(day).startOf('day').toDate(), [Op.lte]: dayjs(day).endOf('day').toDate() } } }),
    })));
  }
}

module.exports = WorkOrderService;
