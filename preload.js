const { contextBridge, ipcRenderer } = require('electron');

// Безопасно экспортируем API в renderer процесс
contextBridge.exposeInMainWorld('electronAPI', {
  // Настройки
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),

  // Roblox
  launchRoblox: () => ipcRenderer.invoke('launch-roblox'),
  getRobloxProfile: (username) => ipcRenderer.invoke('get-roblox-profile', username),

  // Сетевой режим
  startBypass: (mode) => ipcRenderer.invoke('start-bypass', mode),
  stopBypass: () => ipcRenderer.invoke('stop-bypass'),
  getBypassStatus: () => ipcRenderer.invoke('get-network-status'),
  getBypassModes: () => ipcRenderer.invoke('get-bypass-modes'),

  // События от main процесса
  onNetworkStatus: (callback) => {
    ipcRenderer.on('network-status', (event, data) => callback(data));
  },

  // Управление окном
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  // Внешние ссылки (через IPC для безопасности)
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Загрузка/обновление bypass компонентов
  checkBypassFiles: () => ipcRenderer.invoke('check-bypass-files'),
  downloadBypassFiles: () => ipcRenderer.invoke('download-bypass-files'),
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (event, data) => callback(data));
  },

  // Self-update system
  checkLauncherUpdate: () => ipcRenderer.invoke('check-launcher-update'),
  downloadLauncherUpdate: (url) => ipcRenderer.invoke('download-launcher-update', url),
  getLauncherVersion: () => ipcRenderer.invoke('get-launcher-version'),
  onUpdateProgress: (callback) => {
    ipcRenderer.on('update-progress', (event, data) => callback(data));
  },

  // Платформа
  platform: process.platform
});
