const { ipcMain, app } = require('electron');
const { getConnection, executeQuery } = require('./db');
const { BRANCH_SELECT, EMPLOYEE_SELECT, EMPLOYEE_SEQ_UPDATE } = require('./queries');
const logger = require('./logger');

function getKaishaCd() {
  return parseInt(process.env.KAISHA_CD || '2', 10);
}

function registerIpcHandlers() {
  // 支店一覧取得
  ipcMain.handle('get-branches', async () => {
    try {
      logger.info('支店一覧取得開始');
      const result = await executeQuery(BRANCH_SELECT, { kaishaCd: getKaishaCd() });
      const data = result.rows.map(row => ({
        shitenCd: row.SHITEN_CD,
        shitenNm: row.SHITEN_NM,
      }));
      logger.info(`支店一覧取得完了: ${data.length}件`);
      return { success: true, data };
    } catch (err) {
      logger.error('支店一覧取得エラー', { error: err.message, stack: err.stack });
      return { success: false, error: err.message };
    }
  });

  // 社員一覧取得
  ipcMain.handle('get-employees', async (_event, shitenCd) => {
    try {
      logger.info(`社員一覧取得開始: 支店=${shitenCd}`);
      const result = await executeQuery(EMPLOYEE_SELECT, {
        kaishaCd: getKaishaCd(),
        shitenCd,
      });
      const data = result.rows.map(row => ({
        shainCd: row.SHAIN_CD,
        shainNm: row.SHAIN_NM,
        seq: row.SEQ,
      }));
      logger.info(`社員一覧取得完了: ${data.length}名`);
      return { success: true, data };
    } catch (err) {
      logger.error('社員一覧取得エラー', { error: err.message, stack: err.stack, shitenCd });
      return { success: false, error: err.message };
    }
  });

  // SEQ保存（トランザクション）
  // updates: [{ shainCd, newSeq }]
  ipcMain.handle('save-order', async (_event, shitenCd, updates) => {
    let conn;
    try {
      logger.info(`SEQ保存開始: 支店=${shitenCd}`, { updates });
      conn = await getConnection();
      for (const { shainCd, newSeq } of updates) {
        await conn.execute(EMPLOYEE_SEQ_UPDATE, {
          seq: newSeq,
          shainCd,
          shitenCd,
          kaishaCd: getKaishaCd(),
        });
      }
      await conn.commit();
      logger.info('SEQ保存完了');
      return { success: true };
    } catch (err) {
      logger.error('SEQ保存エラー', { error: err.message, stack: err.stack, shitenCd });
      if (conn) {
        try { await conn.rollback(); } catch (e) {
          logger.error('ロールバックエラー', { error: e.message });
        }
      }
      return { success: false, error: err.message };
    } finally {
      if (conn) {
        try { await conn.close(); } catch (e) {
          logger.error('DB接続クローズエラー', { error: e.message });
        }
      }
    }
  });

  // アプリ終了
  ipcMain.handle('quit-app', () => {
    logger.info('アプリ終了');
    app.quit();
  });
}

module.exports = { registerIpcHandlers };
