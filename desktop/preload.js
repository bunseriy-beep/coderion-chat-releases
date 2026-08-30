const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  badge: count => ipcRenderer.send('badge', count),
  onBadge: cb => ipcRenderer.on('badge', (e, count) => cb(count)),
});