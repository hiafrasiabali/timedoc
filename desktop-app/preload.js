const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('timedoc', {
  // Desktop capturer - only thing that needs IPC
  getScreenSources: () => ipcRenderer.invoke('app:get-screen-sources'),

  // Idle detection - needs powerMonitor from main process
  startIdleMonitoring: (idleThresholdSeconds) =>
    ipcRenderer.send('idle:start-monitoring', { idleThresholdSeconds }),
  stopIdleMonitoring: () => ipcRenderer.send('idle:stop-monitoring'),
  onIdleDetected: (callback) =>
    ipcRenderer.on('idle:detected', (event, data) => callback(data)),

  // Session lifecycle notifications for quit cleanup
  notifySessionStarted: (serverUrl, token) =>
    ipcRenderer.send('session:started', { serverUrl, token }),
  notifySessionStopped: () =>
    ipcRenderer.send('session:stopped'),
});
