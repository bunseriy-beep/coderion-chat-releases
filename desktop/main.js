const { app, BrowserWindow, Tray, Menu, nativeImage, Notification, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const APP_URL = 'https://qlinkchat.vercel.app';

let mainWindow = null;
let tray = null;

function findIcon() {
  const tries = [
    path.join(__dirname, 'icon.ico'),
    path.join(__dirname, 'icon.png'),
  ];
  for (const f of tries) if (fs.existsSync(f)) return f;
  return null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 400,
    minHeight: 600,
    icon: findIcon(),
    title: 'QLinkChat',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.once('ready-to-show', () => { mainWindow.show(); });

  mainWindow.on('close', e => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray() {
  const iconPath = findIcon();
  const icon = iconPath ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }) : nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('QLinkChat');

  const ctx = Menu.buildFromTemplate([
    { label: 'Открыть QLinkChat', click: () => { if (mainWindow) mainWindow.show(); else createWindow(); } },
    { type: 'separator' },
    { label: 'Выйти', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(ctx);
  tray.on('double-click', () => { if (mainWindow) mainWindow.show(); });
}

ipcMain.on('notify', (e, { title, body }) => {
  if (Notification.isSupported()) {
    const n = new Notification({ title, body, icon: findIcon() });
    n.on('click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
    n.show();
  }
});

ipcMain.on('badge', (e, count) => {
  if (app.setBadgeCount) app.setBadgeCount(count);
});

app.isQuitting = false;

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('before-quit', () => { app.isQuitting = true; });

app.on('window-all-closed', () => {});

app.on('activate', () => {
  if (mainWindow) mainWindow.show();
  else createWindow();
});