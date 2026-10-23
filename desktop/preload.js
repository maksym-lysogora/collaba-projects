// Bridge between the pages (planner, taskbar strip) and the desktop shell.
// The planner checks for window.tydzenHost: present → desktop mode (data on disk), absent → browser mode.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tydzenHost', {
  load: () => ipcRenderer.sendSync('load'),
  dataPath: () => ipcRenderer.sendSync('data-path'),
  save: s => ipcRenderer.send('save', s),
  onCmd: cb => ipcRenderer.on('cmd', (e, c) => cb(c)),
  onSaveError: cb => ipcRenderer.on('save-error', (e, msg) => cb(msg)),
  onHotkeyFailed: cb => ipcRenderer.on('hotkey-failed', (e, list) => cb(list)),
  suspendHotkeys: v => ipcRenderer.send('suspend-hotkeys', v),
  toggleBar: () => ipcRenderer.send('toggle-bar'),
  alert: a => ipcRenderer.send('alert', a),
  openDataFolder: () => ipcRenderer.send('open-data'),
});

contextBridge.exposeInMainWorld('barHost', {
  ready: () => ipcRenderer.send('bar-ready'),
  onState: cb => ipcRenderer.on('state', (e, s) => cb(s)),
  onAlert: cb => ipcRenderer.on('alert', (e, a) => cb(a)),
  cmd: c => ipcRenderer.send('bar-cmd', c),
  menu: () => ipcRenderer.send('bar-menu'),
  openPlanner: () => ipcRenderer.send('open-planner'),
});
