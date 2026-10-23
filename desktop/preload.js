// Bridge between the pages (planner, taskbar strip) and the desktop shell.
// The planner checks for window.tydzenHost: present → desktop mode (data on disk), absent → browser mode.
//
// The planner window reads and writes data.json itself, synchronously, on every change. Saving must not depend on
// the main process: twice it stopped answering while the window kept working, and every change since was lost.
// The main process still receives each state (taskbar strip, tray, hotkeys) and writes the same file as a second copy.
const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const { DATA_DIR: DIR } = require('./datadir');

const FILE = path.join(DIR, 'data.json');
const BACKUPS = path.join(DIR, 'backups');

function log(msg) {
  try { fs.mkdirSync(DIR, { recursive: true }); fs.appendFileSync(path.join(DIR, 'app.log'), `${new Date().toISOString()} [window] ${msg}\n`); } catch {}
}
function readFile() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) {
    if (fs.existsSync(FILE)) log('data.json unreadable: ' + e.message);
    try {
      const b = fs.readdirSync(BACKUPS).filter(f => /^data-.*\.json$/.test(f)).sort().pop();
      if (b) { log('loaded from backup ' + b); return JSON.parse(fs.readFileSync(path.join(BACKUPS, b), 'utf8')); }
    } catch {}
    return null;
  }
}
let lastError = '';
function writeFile(s) {
  const json = JSON.stringify(s, null, 1);
  try {
    fs.mkdirSync(BACKUPS, { recursive: true });
    const tmp = FILE + '.w.tmp';
    fs.writeFileSync(tmp, json, 'utf8');
    try { fs.renameSync(tmp, FILE); } catch { fs.writeFileSync(FILE, json, 'utf8'); fs.rmSync(tmp, { force: true }); }
    lastError = '';
    return true;
  } catch (e) {
    if (e.message !== lastError) log('write failed: ' + e.message);
    lastError = e.message;
    return false;
  }
}

contextBridge.exposeInMainWorld('tydzenHost', {
  // The file on disk is the source of truth; ask the main process only if the file can't be read at all.
  load: () => {
    const d = readFile() || ipcRenderer.sendSync('load');
    log(`start: ${d && d.projects ? d.projects.length : 0} projects, ${d && d.entries ? d.entries.length : 0} entries`);
    return d;
  },
  dataPath: () => DIR,
  save: s => { const ok = writeFile(s); ipcRenderer.send('save', s); return ok; },
  log,
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
