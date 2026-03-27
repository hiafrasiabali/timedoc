const { app, BrowserWindow, Tray, Menu, ipcMain, powerMonitor, desktopCapturer } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 520,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'TimeDOC',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('close', (e) => {
    // Minimize to tray instead of closing
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  // Use a simple default icon - on Windows electron provides a default
  try {
    tray = new Tray(path.join(__dirname, 'renderer', 'icon.png'));
  } catch {
    // If icon doesn't exist, skip tray icon (will work after build with proper icon)
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show TimeDOC',
      click: () => {
        if (mainWindow) mainWindow.show();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('TimeDOC');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) mainWindow.show();
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- IPC Handlers ----

// Auth
ipcMain.handle('auth:login', async (event, { serverUrl, username, password }) => {
  const { login } = require('./src/auth');
  return login(serverUrl, username, password);
});

// Session control
ipcMain.handle('session:start', async (event, { serverUrl, token, workDate }) => {
  const { startSession } = require('./src/auth');
  return startSession(serverUrl, token, workDate);
});

ipcMain.handle('session:stop', async (event, { serverUrl, token }) => {
  const { stopSession } = require('./src/auth');
  return stopSession(serverUrl, token);
});

ipcMain.handle('session:pause', async (event, { serverUrl, token }) => {
  const { pauseSession } = require('./src/auth');
  return pauseSession(serverUrl, token);
});

ipcMain.handle('session:resume', async (event, { serverUrl, token }) => {
  const { resumeSession } = require('./src/auth');
  return resumeSession(serverUrl, token);
});

// Recording control - receive base64 data from renderer, save to temp, upload
ipcMain.on('recording:chunk-ready', async (event, { serverUrl, token, sessionId, chunkNumber, base64Data, startTime, endTime }) => {
  const { uploadChunk } = require('./src/uploader');
  const fs = require('fs');
  const tempDir = path.join(app.getPath('temp'), 'timedoc-recordings');
  fs.mkdirSync(tempDir, { recursive: true });

  const filePath = path.join(tempDir, `chunk_${sessionId}_${chunkNumber}.webm`);
  fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

  try {
    await uploadChunk(serverUrl, token, sessionId, chunkNumber, filePath, startTime, endTime);
    event.reply('recording:chunk-uploaded', { chunkNumber, success: true });
  } catch (err) {
    event.reply('recording:chunk-uploaded', { chunkNumber, success: false, error: err.message });
  }
});

// Idle detection
let idleCheckInterval = null;

ipcMain.on('idle:start-monitoring', (event, { idleThresholdSeconds }) => {
  const threshold = idleThresholdSeconds || 300; // 5 minutes default
  if (idleCheckInterval) clearInterval(idleCheckInterval);

  idleCheckInterval = setInterval(() => {
    const idleTime = powerMonitor.getSystemIdleTime();
    if (idleTime >= threshold) {
      event.reply('idle:detected', { idleSeconds: idleTime });
    }
  }, 10000); // Check every 10 seconds
});

ipcMain.on('idle:stop-monitoring', () => {
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
    idleCheckInterval = null;
  }
});

// Get screen sources for recording
ipcMain.handle('app:get-screen-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 0, height: 0 },
  });
  return sources.map((s) => ({ id: s.id, name: s.name }));
});

// Get temp path for recordings
ipcMain.handle('app:get-temp-path', () => {
  return path.join(app.getPath('temp'), 'timedoc-recordings');
});
