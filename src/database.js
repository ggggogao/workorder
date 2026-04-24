const { Sequelize } = require('sequelize');
require('dotenv').config();

let sequelize;

if (process.env.DATABASE_URL) {
  // Railway 自动注入的连接字符串（支持 MySQL 和 PostgreSQL）
  const isMysql = process.env.DATABASE_URL.startsWith('mysql');
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: isMysql ? 'mysql' : 'postgres',
    dialectOptions: isMysql ? {} : {
      ssl: { require: true, rejectUnauthorized: false }
    },
    logging: false,
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
    define: { timestamps: true, underscored: true },
    timezone: '+08:00',
  });
} else {
  // 本地开发：使用各自的环境变量
  sequelize = new Sequelize(
    process.env.DB_NAME || 'health_workorder',
    process.env.DB_USER || 'root',
    process.env.DB_PASSWORD || '',
    {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      dialect: process.env.DB_DIALECT || 'mysql',
      logging: false,
      define: { timestamps: true, underscored: true },
      timezone: '+08:00',
    }
  );
}

module.exports = sequelize;
