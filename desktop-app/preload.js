const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('timedoc', {
  // API calls via main process (fetch from file:// is unreliable)
  apiCall: (method, path, body) =>
    ipcRenderer.invoke('api:call', { method, path, body }),

  // Desktop capturer
  getScreenSources: () => ipcRenderer.invoke('app:get-screen-sources'),

  // Idle detection
  startIdleMonitoring: (idleThresholdSeconds) =>
    ipcRenderer.send('idle:start-monitoring', { idleThresholdSeconds }),
  stopIdleMonitoring: () => ipcRenderer.send('idle:stop-monitoring'),
  onIdleDetected: (callback) =>
    ipcRenderer.on('idle:detected', (event, data) => callback(data)),
});
