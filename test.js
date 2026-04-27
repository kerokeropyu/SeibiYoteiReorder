/**
 * DB接続テストスクリプト
 * 使い方: node test.js
 * 実行前に .env ファイルを用意してください。
 */
require('dotenv').config();
const oracledb = require('oracledb');

const user    = process.env.DB_USER;
const password = process.env.DB_PASSWORD;
const host    = process.env.DB_HOST;
const port    = process.env.DB_PORT || '1521';
const service = process.env.DB_SERVICE;

if (!user || !password || !host || !service) {
  console.error('エラー: .env ファイルに DB_USER / DB_PASSWORD / DB_HOST / DB_SERVICE を設定してください。');
  process.exit(1);
}

const connectString = `${host}:${port}/${service}`;

async function main() {
  console.log('=== DB接続テスト ===');
  console.log(`接続先: ${user}@${connectString}`);

  let conn;
  try {
    conn = await oracledb.getConnection({ user, password, connectString });
    console.log('✔ 接続成功');

    const result = await conn.execute('SELECT SYSDATE FROM DUAL');
    console.log('✔ SYSDATE:', result.rows[0][0]);

    console.log('\n接続テスト正常終了');
  } catch (err) {
    console.error('✘ 接続失敗:', err.message);
    process.exit(1);
  } finally {
    if (conn) {
      try {
        await conn.close();
        console.log('接続クローズ完了');
      } catch (e) {
        console.error('クローズエラー:', e.message);
      }
    }
  }
}

main();
