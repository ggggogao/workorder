const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const Project = sequelize.define('Project', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  code: { type: DataTypes.STRING(50), unique: true },
  owner: { type: DataTypes.STRING(50) },
  owner_email: { type: DataTypes.STRING(100) },
  status: { type: DataTypes.STRING(20), defaultValue: 'active' },
  description: { type: DataTypes.TEXT },
  external_id: { type: DataTypes.STRING(100) },
}, { tableName: 'projects' });

const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(50), allowNull: false },
  email: { type: DataTypes.STRING(100), unique: true, allowNull: false },
  password: { type: DataTypes.STRING(255), allowNull: false },
  phone: { type: DataTypes.STRING(20) },
  wecom_id: { type: DataTypes.STRING(100) },
  role: { type: DataTypes.STRING(20), defaultValue: 'agent' },
  dept: { type: DataTypes.STRING(100), defaultValue: '健康服务部' },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  notify_daily: { type: DataTypes.BOOLEAN, defaultValue: true },
  notify_overdue: { type: DataTypes.BOOLEAN, defaultValue: true },
  notify_urgent: { type: DataTypes.BOOLEAN, defaultValue: false },
  last_login_at: { type: DataTypes.DATE },
}, { tableName: 'users' });

const WorkOrder = sequelize.define('WorkOrder', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  order_no: { type: DataTypes.STRING(30), unique: true, allowNull: false },
  project_id: { type: DataTypes.INTEGER, allowNull: false },
  customer_name: { type: DataTypes.STRING(100), allowNull: false },
  customer_phone: { type: DataTypes.STRING(20) },
  customer_id: { type: DataTypes.STRING(50) },
  issue_type: { type: DataTypes.STRING(50), allowNull: false },
  title: { type: DataTypes.STRING(200), allowNull: false },
  description: { type: DataTypes.TEXT },
  status: { type: DataTypes.STRING(20), defaultValue: 'pending' },
  priority: { type: DataTypes.STRING(20), defaultValue: 'normal' },
  assignee_id: { type: DataTypes.INTEGER },
  source: { type: DataTypes.STRING(20), defaultValue: 'manual' },
  deadline: { type: DataTypes.DATEONLY },
  resolved_at: { type: DataTypes.DATE },
  remark: { type: DataTypes.TEXT },
  external_id: { type: DataTypes.STRING(100) },
  external_source: { type: DataTypes.STRING(50) },
}, { tableName: 'work_orders' });

const WorkOrderLog = sequelize.define('WorkOrderLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  work_order_id: { type: DataTypes.INTEGER, allowNull: false },
  operator_id: { type: DataTypes.INTEGER },
  action: { type: DataTypes.STRING(50), allowNull: false },
  from_status: { type: DataTypes.STRING(20) },
  to_status: { type: DataTypes.STRING(20) },
  content: { type: DataTypes.TEXT },
}, { tableName: 'work_order_logs' });

const NotifyLog = sequelize.define('NotifyLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  channel: { type: DataTypes.STRING(20), allowNull: false },
  notify_type: { type: DataTypes.STRING(30), defaultValue: 'daily_summary' },
  recipients: { type: DataTypes.TEXT },
  subject: { type: DataTypes.STRING(200) },
  pending_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  status: { type: DataTypes.STRING(20), defaultValue: 'success' },
  error_msg: { type: DataTypes.TEXT },
  sent_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'notify_logs' });

const NotifyTemplate = sequelize.define('NotifyTemplate', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  key: { type: DataTypes.STRING(50), unique: true, allowNull: false },
  subject: { type: DataTypes.STRING(200) },
  greeting: { type: DataTypes.TEXT },
  footer: { type: DataTypes.TEXT },
  signature: { type: DataTypes.STRING(200) },
  show_project_detail: { type: DataTypes.BOOLEAN, defaultValue: true },
  show_urgent_count: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'notify_templates' });

const SystemConfig = sequelize.define('SystemConfig', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  key: { type: DataTypes.STRING(100), unique: true, allowNull: false },
  value: { type: DataTypes.TEXT },
  description: { type: DataTypes.STRING(200) },
}, { tableName: 'system_configs' });

Project.hasMany(WorkOrder, { foreignKey: 'project_id', as: 'workOrders' });
WorkOrder.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });
User.hasMany(WorkOrder, { foreignKey: 'assignee_id', as: 'assignedOrders' });
WorkOrder.belongsTo(User, { foreignKey: 'assignee_id', as: 'assignee' });
WorkOrder.hasMany(WorkOrderLog, { foreignKey: 'work_order_id', as: 'logs' });
WorkOrderLog.belongsTo(WorkOrder, { foreignKey: 'work_order_id' });
User.hasMany(WorkOrderLog, { foreignKey: 'operator_id', as: 'operations' });
WorkOrderLog.belongsTo(User, { foreignKey: 'operator_id', as: 'operator' });

module.exports = { sequelize, Project, User, WorkOrder, WorkOrderLog, NotifyLog, NotifyTemplate, SystemConfig };
