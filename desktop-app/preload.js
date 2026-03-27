const { contextBridge, ipcRenderer } = require('electron');

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

  // Upload chunk: send ArrayBuffer to main process which writes to file and uploads
  uploadChunk: (arrayBuffer, sessionId, chunkNumber, startTime, endTime) =>
    ipcRenderer.invoke('api:upload-file', {
      sessionId, chunkNumber, startTime, endTime,
      data: Buffer.from(arrayBuffer),
    }),

  // Auto-updater
  onUpdateStatus: (callback) =>
    ipcRenderer.on('update:status', (event, data) => callback(data)),
  checkForUpdate: () => ipcRenderer.invoke('app:check-update'),
});
