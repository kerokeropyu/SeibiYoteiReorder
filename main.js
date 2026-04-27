const path = require('path');
const { app, BrowserWindow } = require('electron');

// .env 読み込み（パッケージ後は exe と同階層の .env を参照）
const envPath = app.isPackaged
  ? path.join(process.resourcesPath, '.env')
  : path.resolve(__dirname, '.env');
require('dotenv').config({ path: envPath });

const logger = require('./src/logger');
const { registerIpcHandlers } = require('./src/ipcHandlers');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 680,
    minWidth: 800,
    minHeight: 500,
    title: '整備予定 担当者順序変更',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile('index.html');
  logger.info('ウィンドウ作成完了');
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  logger.info('アプリ起動完了');
});

app.on('window-all-closed', () => {
  app.quit();
});

process.on('uncaughtException', (err) => {
  logger.error('未処理例外 (main process)', { error: err.message, stack: err.stack });
});
