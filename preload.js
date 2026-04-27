const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dbAPI', {
  getBranches: () =>
    ipcRenderer.invoke('get-branches'),
  getEmployees: (shitenCd) =>
    ipcRenderer.invoke('get-employees', shitenCd),
  saveOrder: (shitenCd, updates) =>
    ipcRenderer.invoke('save-order', shitenCd, updates),
});

contextBridge.exposeInMainWorld('appAPI', {
  quit: () => ipcRenderer.invoke('quit-app'),
});
