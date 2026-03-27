const { app, BrowserWindow, Tray, Menu, ipcMain, powerMonitor, desktopCapturer } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');

let mainWindow = null;
let tray = null;
let activeSessionInfo = null;

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
});

app.on('before-quit', async (e) => {
  app.isQuitting = true;
  if (activeSessionInfo) {
    e.preventDefault();
    const { serverUrl, token } = activeSessionInfo;
    activeSessionInfo = null;
    await nodeApiCall(serverUrl, 'POST', '/api/sessions/stop', token, {});
    app.quit();
  }
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
    activeSessionInfo = { serverUrl: storedServerUrl, token: storedToken };
    console.log('[IPC] Session started, tracking for quit cleanup');
  }
  if (result.ok && apiPath === '/api/sessions/stop') {
    activeSessionInfo = null;
    console.log('[IPC] Session stopped, cleared quit cleanup');
  }

  return result;
});

// Log before-quit
app.on('will-quit', () => {
  console.log('[APP] will-quit, activeSession:', !!activeSessionInfo);
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

// ---- Upload via multipart (for recordings) ----
function uploadChunkViaNode({ sessionId, chunkNumber, startTime, endTime, base64Data }) {
  return new Promise((resolve) => {
    const url = new URL('/api/recordings/upload', storedServerUrl);
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;

    const boundary = '----TimeDOC' + Date.now();
    const fileBuffer = Buffer.from(base64Data, 'base64');

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
