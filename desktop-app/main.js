const { app, BrowserWindow, Tray, Menu, ipcMain, powerMonitor, desktopCapturer, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const http = require('http');
const https = require('https');

let mainWindow = null;
let tray = null;
// Session cleanup handled server-side via stale heartbeat detection

// ---- Generic API call via Node http ----
function nodeApiCall(serverUrl, method, apiPath, token, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, serverUrl);
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;

    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const bodyStr = body ? JSON.stringify(body) : '';

    const req = transport.request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: method,
      headers: headers,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            resolve({ ok: false, status: res.statusCode, error: json.error || 'HTTP ' + res.statusCode });
          } else {
            resolve({ ok: true, data: json });
          }
        } catch (e) {
          resolve({ ok: false, status: res.statusCode, error: 'Invalid response' });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ ok: false, status: 0, error: err.message });
    });

    req.setTimeout(15000, () => {
      req.destroy();
      resolve({ ok: false, status: 0, error: 'Request timeout' });
    });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ---- Window ----
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
  } catch { return; }

  tray.setToolTip('TimeDOC');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show TimeDOC', click: () => { if (mainWindow) mainWindow.show(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  tray.on('click', () => { if (mainWindow) mainWindow.show(); });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  setupAutoUpdater();
});

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    sendToRenderer('update:status', 'Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    sendToRenderer('update:status', 'Downloading v' + info.version + '...');
  });

  autoUpdater.on('update-not-available', () => {
    sendToRenderer('update:status', '');
  });

  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('update:status', 'Downloading update: ' + Math.round(progress.percent) + '%');
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendToRenderer('update:status', 'ready');
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'TimeDOC v' + info.version + ' is ready. Restart now to update.',
      buttons: ['Restart Now', 'Later'],
    }).then((result) => {
      if (result.response === 0) {
        app.isQuitting = true;
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', () => {
    sendToRenderer('update:status', '');
  });

  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 30 * 60 * 1000);
}

function sendToRenderer(channel, data) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send(channel, data);
  }
}

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- IPC: Generic API call ----
// Renderer sends { method, path, body } and we add serverUrl + token from stored state
let storedServerUrl = '';
let storedToken = '';

ipcMain.handle('api:call', async (event, { method, path: apiPath, body }) => {
  // Special methods
  if (method === 'SET_SERVER') {
    storedServerUrl = apiPath;
    console.log('[IPC] SET_SERVER:', storedServerUrl);
    return { ok: true };
  }

  if (method === 'UPLOAD') {
    console.log('[IPC] UPLOAD chunk', body.chunkNumber, 'for session', body.sessionId);
    return uploadChunkViaNode(body);
  }

  console.log('[IPC]', method, apiPath, '| server:', storedServerUrl, '| hasToken:', !!storedToken);
  const result = await nodeApiCall(storedServerUrl, method, apiPath, storedToken, body);
  console.log('[IPC] Result:', apiPath, result.ok ? 'OK' : 'FAIL:' + result.error);

  // Track session lifecycle
  if (result.ok && apiPath === '/api/auth/login' && result.data && result.data.token) {
    storedToken = result.data.token;
    console.log('[IPC] Token stored for user:', result.data.user.display_name);
  }
  if (result.ok && apiPath === '/api/sessions/start') {
    console.log('[IPC] Session started');
  }
  if (result.ok && apiPath === '/api/sessions/stop') {
    console.log('[IPC] Session stopped');
  }

  return result;
});


// ---- Desktop capturer ----
ipcMain.handle('app:get-screen-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 0, height: 0 },
  });
  return sources.map((s) => ({ id: s.id, name: s.name }));
});

// ---- Idle detection ----
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
  if (idleCheckInterval) { clearInterval(idleCheckInterval); idleCheckInterval = null; }
});

// Upload chunk from temp file (no IPC data serialization)
ipcMain.handle('api:upload-file', async (event, { sessionId, chunkNumber, startTime, endTime, filePath }) => {
  const fs = require('fs');
  if (!fs.existsSync(filePath)) return { ok: false, error: 'Temp file missing' };

  const fileBuffer = fs.readFileSync(filePath);
  console.log('[UPLOAD] Chunk ' + chunkNumber + ' for session ' + sessionId + ' (' + fileBuffer.length + ' bytes from file)');

  const result = await uploadChunkViaNode({
    sessionId, chunkNumber, startTime, endTime,
    fileBuffer: fileBuffer,
  });

  // Clean up temp file
  try { fs.unlinkSync(filePath); } catch {}
  return result;
});

// Manual update check
ipcMain.handle('app:check-update', () => {
  autoUpdater.checkForUpdates().catch(() => {});
});

// Open URL in default browser
ipcMain.handle('app:open-external', (event, url) => {
  const { shell } = require('electron');
  shell.openExternal(url);
});

// ---- Upload via multipart (for recordings) ----
function uploadChunkViaNode({ sessionId, chunkNumber, startTime, endTime, fileBuffer, rawData, base64Data }) {
  return new Promise((resolve) => {
    const url = new URL('/api/recordings/upload', storedServerUrl);
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;

    const boundary = '----TimeDOC' + Date.now();
    if (!Buffer.isBuffer(fileBuffer)) {
      fileBuffer = rawData ? Buffer.from(rawData) : Buffer.from(base64Data || '', 'base64');
    }

    let body = '';
    const fields = { session_id: String(sessionId), chunk_number: String(chunkNumber), start_time: startTime, end_time: endTime };
    for (const [k, v] of Object.entries(fields)) {
      body += '--' + boundary + '\r\n';
      body += 'Content-Disposition: form-data; name="' + k + '"\r\n\r\n';
      body += v + '\r\n';
    }

    const fileHeader = '--' + boundary + '\r\nContent-Disposition: form-data; name="chunk"; filename="chunk_' + chunkNumber + '.webm"\r\nContent-Type: video/webm\r\n\r\n';
    const fileFooter = '\r\n--' + boundary + '--\r\n';

    const bodyBuffer = Buffer.concat([
      Buffer.from(body), Buffer.from(fileHeader), fileBuffer, Buffer.from(fileFooter)
    ]);

    const req = transport.request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': bodyBuffer.length,
        'Authorization': 'Bearer ' + storedToken,
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve({ ok: res.statusCode < 400, status: res.statusCode }));
    });

    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.setTimeout(60000, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(bodyBuffer);
    req.end();
  });
}
