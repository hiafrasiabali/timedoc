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
});
