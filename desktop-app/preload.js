const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('timedoc', {
  // Auth
  login: (serverUrl, username, password) =>
    ipcRenderer.invoke('auth:login', { serverUrl, username, password }),

  // Sessions
  startSession: (serverUrl, token, workDate) =>
    ipcRenderer.invoke('session:start', { serverUrl, token, workDate }),
  stopSession: (serverUrl, token) =>
    ipcRenderer.invoke('session:stop', { serverUrl, token }),
  pauseSession: (serverUrl, token) =>
    ipcRenderer.invoke('session:pause', { serverUrl, token }),
  resumeSession: (serverUrl, token) =>
    ipcRenderer.invoke('session:resume', { serverUrl, token }),

  // Heartbeat
  sendHeartbeat: (serverUrl, token) =>
    ipcRenderer.invoke('session:heartbeat', { serverUrl, token }),

  // Recording
  sendChunk: (data) => ipcRenderer.send('recording:chunk-ready', data),
  onChunkUploaded: (callback) =>
    ipcRenderer.on('recording:chunk-uploaded', (event, data) => callback(data)),

  // Idle detection
  startIdleMonitoring: (idleThresholdSeconds) =>
    ipcRenderer.send('idle:start-monitoring', { idleThresholdSeconds }),
  stopIdleMonitoring: () => ipcRenderer.send('idle:stop-monitoring'),
  onIdleDetected: (callback) =>
    ipcRenderer.on('idle:detected', (event, data) => callback(data)),

  // App utils
  getTempPath: () => ipcRenderer.invoke('app:get-temp-path'),

  // Desktop capturer - get screen sources via main process
  getScreenSources: () => ipcRenderer.invoke('app:get-screen-sources'),
});
