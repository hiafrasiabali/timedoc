const { app, BrowserWindow, Tray, Menu, ipcMain, powerMonitor, desktopCapturer } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;
let activeSessionInfo = null; // { serverUrl, token } for quit cleanup

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 550,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'TimeDOC',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow fetch from file:// to http://
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  try {
    tray = new Tray(path.join(__dirname, 'renderer', 'icon.png'));
  } catch {
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show TimeDOC',
      click: () => { if (mainWindow) mainWindow.show(); },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => { app.isQuitting = true; app.quit(); },
    },
  ]);

  tray.setToolTip('TimeDOC');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => { if (mainWindow) mainWindow.show(); });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
});

// Auto-stop session on quit
app.on('before-quit', async (e) => {
  app.isQuitting = true;

  if (activeSessionInfo) {
    e.preventDefault();
    const { serverUrl, token } = activeSessionInfo;
    activeSessionInfo = null;

    try {
      const http = require(serverUrl.startsWith('https') ? 'https' : 'http');
      const url = new URL('/api/sessions/stop', serverUrl);
      await new Promise((resolve) => {
        const req = http.request({
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
          },
        }, () => resolve());
        req.on('error', () => resolve());
        req.setTimeout(5000, () => { req.destroy(); resolve(); });
        req.write('{}');
        req.end();
      });
    } catch (err) {
      console.error('Failed to stop session on quit:', err.message);
    }

    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- IPC Handlers ----

// Session lifecycle - renderer notifies us so we can cleanup on quit
ipcMain.on('session:started', (event, { serverUrl, token }) => {
  activeSessionInfo = { serverUrl, token };
});

ipcMain.on('session:stopped', () => {
  activeSessionInfo = null;
});

// Desktop capturer - must run in main process
ipcMain.handle('app:get-screen-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 0, height: 0 },
  });
  return sources.map((s) => ({ id: s.id, name: s.name }));
});

// Idle detection - uses powerMonitor
let idleCheckInterval = null;

ipcMain.on('idle:start-monitoring', (event, { idleThresholdSeconds }) => {
  const threshold = idleThresholdSeconds || 300;
  if (idleCheckInterval) clearInterval(idleCheckInterval);

  idleCheckInterval = setInterval(() => {
    const idleTime = powerMonitor.getSystemIdleTime();
    if (idleTime >= threshold) {
      event.reply('idle:detected', { idleSeconds: idleTime });
    }
  }, 10000);
});

ipcMain.on('idle:stop-monitoring', () => {
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
    idleCheckInterval = null;
  }
});
