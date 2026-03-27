const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

contextBridge.exposeInMainWorld('timedoc', {
  apiCall: (method, path, body) =>
    ipcRenderer.invoke('api:call', { method, path, body }),

  getScreenSources: () => ipcRenderer.invoke('app:get-screen-sources'),

  startIdleMonitoring: (idleThresholdSeconds) =>
    ipcRenderer.send('idle:start-monitoring', { idleThresholdSeconds }),
  stopIdleMonitoring: () => ipcRenderer.send('idle:stop-monitoring'),
  onIdleDetected: (callback) =>
    ipcRenderer.on('idle:detected', (event, data) => callback(data)),

  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),

  // Save chunk to temp file and trigger upload (avoids IPC data corruption)
  saveAndUploadChunk: (arrayBuffer, sessionId, chunkNumber, startTime, endTime) => {
    const tmpDir = path.join(os.tmpdir(), 'timedoc-chunks');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, 'chunk_' + sessionId + '_' + chunkNumber + '.webm');
    fs.writeFileSync(tmpFile, Buffer.from(arrayBuffer));
    return ipcRenderer.invoke('api:upload-file', { sessionId, chunkNumber, startTime, endTime, filePath: tmpFile });
  },

  // Auto-updater
  onUpdateStatus: (callback) =>
    ipcRenderer.on('update:status', (event, data) => callback(data)),
  checkForUpdate: () => ipcRenderer.invoke('app:check-update'),
});
