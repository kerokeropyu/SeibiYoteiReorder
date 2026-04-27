const oracledb = require('oracledb');
const logger = require('./logger');

// thin モードで動作（Oracle Instant Client 不要）
// initOracleClient() を呼ばない = thin モード
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

function getDbConfig() {
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT || '1521';
  const service = process.env.DB_SERVICE;

  if (!user || !password || !host || !service) {
    throw new Error(
      'DB接続情報が不足しています。.env ファイルを確認してください。' +
      ' (必須: DB_USER, DB_PASSWORD, DB_HOST, DB_SERVICE)'
    );
  }

  return {
    user,
    password,
    connectString: `${host}:${port}/${service}`,
  };
}

async function getConnection() {
  const config = getDbConfig();
  logger.info(`DB接続: ${config.user}@${config.connectString}`);
  return oracledb.getConnection(config);
}

async function executeQuery(sql, params = {}, options = {}) {
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(sql, params, options);
    return result;
  } finally {
    if (conn) {
      try { await conn.close(); } catch (e) {
        logger.error('DB接続クローズエラー', { error: e.message });
      }
    }
  }
}

module.exports = { getConnection, executeQuery };
