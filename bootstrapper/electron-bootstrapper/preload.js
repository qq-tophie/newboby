const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bootstrapper', {
  // Listen for status updates
  onStatus: (callback) => {
    ipcRenderer.on('status', (event, data) => callback(data));
  },
  
  // Retry download
  retry: () => ipcRenderer.invoke('retry'),
  
  // Close window
  close: () => ipcRenderer.send('window-close')
});
