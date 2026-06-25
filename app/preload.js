const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pixelPetDesktop', {
  quit: () => ipcRenderer.invoke('app:quit'),
  reload: () => ipcRenderer.invoke('app:reload'),
  setMinimized: (minimized) => ipcRenderer.invoke('app:setMinimized', !!minimized),
  openPanel: () => ipcRenderer.invoke('app:openPanel'),
  closePanel: () => ipcRenderer.invoke('app:closePanel'),
  bringToFront: () => ipcRenderer.invoke('app:bringToFront')
});

window.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'q') {
    ipcRenderer.invoke('app:quit');
  }
});
