// Collaba Projects — desktop shell.
// The planner itself is tydzen.html (the same file you test in a browser). This process adds what a browser can't:
// a data file on disk, a strip on the taskbar, a tray icon, global hotkeys and autostart.
const { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, nativeImage, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Data lives in <project>/data (see datadir.js), outside the program folder, so rebuilding never touches it.
const { DATA_DIR, LEGACY_DIR } = require('./datadir');
const OLD_DATA_DIR = LEGACY_DIR; // where data lived before 1.2.1
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const KEEP_BACKUPS = 30;
const UI_FILE = app.isPackaged ? path.join(__dirname, 'tydzen.html') : path.join(__dirname, '..', 'tydzen.html');
const PRELOAD = path.join(__dirname, 'preload.js');
const ICON = path.join(__dirname, 'assets', 'icon.ico');
const TRAY_ICON = path.join(__dirname, 'assets', 'tray.png');
const APP_NAME = 'Collaba Projects';

let mainWin = null, bar = null, tray = null, quitting = false;
let current = null, settings = {}, writeTimer = null, hotkeyConf = '', hotkeysSuspended = false;

app.setAppUserModelId('ua.collaba-projects');
app.setName(APP_NAME);
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => showMain());

/* ---------- data file ---------- */
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
function loadData() {
  // First start with a new data folder: copy (never move) the old one, so it stays as a safety copy.
  if (DATA_DIR !== OLD_DATA_DIR && !fs.existsSync(DATA_FILE) && fs.existsSync(path.join(OLD_DATA_DIR, 'data.json'))) fs.cpSync(OLD_DATA_DIR, DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  let d = readJson(DATA_FILE);
  if (!d && fs.existsSync(DATA_FILE)) {
    // The main file is damaged: fall back to the newest backup instead of starting empty.
    const b = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json')).sort().pop();
    if (b) d = readJson(path.join(BACKUP_DIR, b));
  }
  return d;
}
function logError(where, e) {
  try { fs.appendFileSync(path.join(DATA_DIR, 'error.log'), `${new Date().toISOString()} ${where}: ${e && e.stack || e}\n`); } catch {}
}
// A failed write must never stop later writes: it is logged, retried, and reported to the planner.
function writeData() {
  clearTimeout(writeTimer); writeTimer = null;
  if (!current) return;
  const json = JSON.stringify(current, null, 1);
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, json, 'utf8');
    try { fs.renameSync(tmp, DATA_FILE); }
    catch { fs.writeFileSync(DATA_FILE, json, 'utf8'); fs.rmSync(tmp, { force: true }); } // file briefly locked (antivirus, indexer)
  } catch (e) {
    logError('write', e);
    send(mainWin, 'save-error', String(e && e.message || e));
    writeTimer = setTimeout(writeData, 3000);
    return;
  }
  try {
    const day = new Date().toISOString().slice(0, 10);
    fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, `data-${day}.json`));
    const all = fs.readdirSync(BACKUP_DIR).filter(f => /^data-\d{4}-\d\d-\d\d\.json$/.test(f)).sort();
    all.slice(0, Math.max(0, all.length - KEEP_BACKUPS)).forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));
  } catch (e) { logError('backup', e); }
}
// An unexpected error must not freeze the app behind a modal error box (that would block saving too).
process.on('uncaughtException', e => logError('uncaught', e));
function scheduleWrite() { clearTimeout(writeTimer); writeTimer = setTimeout(writeData, 300); }
function saveSettings() { try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings), 'utf8'); } catch {} }

/* ---------- helpers ---------- */
const proj = id => current && (current.projects || []).find(p => p.id === id);
const active = () => current ? (current.projects || []).filter(p => !p.archived) : [];
const send = (win, ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };
const cmd = c => send(mainWin, 'cmd', c);
function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}`;
}

/* ---------- tray icon: a dot in the running project's color ---------- */
function makeIcon(hex, ring) {
  const S = 32, buf = Buffer.alloc(S * S * 4);
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x - 15.5, y - 15.5), i = (y * S + x) * 4;
    let a = Math.max(0, Math.min(1, 13.5 - d));
    if (ring) a *= Math.max(0, Math.min(1, d - 7.5));
    buf[i] = b; buf[i + 1] = g; buf[i + 2] = r; buf[i + 3] = Math.round(a * 255);
  }
  return nativeImage.createFromBitmap(buf, { width: S, height: S, scaleFactor: 2 });
}
function updateTray() {
  if (!tray) return;
  const t = current && current.timer, p = t && proj(t.p);
  // Idle: the Collaba "P". Running or paused: a dot in the project's color (a ring while paused).
  tray.setImage(p ? makeIcon(p.color, !t.s) : nativeImage.createFromPath(TRAY_ICON));
  tray.setToolTip(p ? `${t.s ? '▶' : '❚❚'} ${p.name}` : `${APP_NAME} — таймер зупинено`);
  const login = app.getLoginItemSettings({ path: process.execPath, args: ['--hidden'] }).openAtLogin;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Відкрити планер', click: showMain },
    { label: bar && bar.isVisible() ? 'Сховати смужку' : 'Показати смужку', click: toggleBar },
    { type: 'separator' },
    ...active().map(pr => ({ label: pr.name, type: 'radio', checked: !!(t && t.p === pr.id), click: () => cmd({ act: 'switch', p: pr.id }) })),
    { type: 'separator' },
    { label: t && t.s ? 'Пауза' : 'Продовжити / старт', click: () => cmd({ act: 'pauseToggle' }) },
    { label: 'Зупинити', enabled: !!t, click: () => cmd({ act: 'stop' }) },
    { type: 'separator' },
    { label: 'Відкрити папку з даними', click: () => shell.openPath(DATA_DIR) },
    { label: 'Запускати разом з Windows', type: 'checkbox', checked: login,
      click: m => { app.setLoginItemSettings({ openAtLogin: m.checked, path: process.execPath, args: ['--hidden'] }); } },
    { type: 'separator' },
    { label: 'Вийти', click: () => { quitting = true; app.quit(); } },
  ]));
}

/* ---------- global hotkeys (work from any program) ---------- */
// The planner records keys as browser codes ("Alt+KeyP", "F13"); Electron wants accelerators ("Alt+P").
function accel(c) {
  if (!c) return null;
  const parts = c.split('+'), code = parts.pop();
  const mods = parts.map(m => ({ Ctrl: 'Control', Alt: 'Alt', Shift: 'Shift', Win: 'Super' }[m]));
  let m, k = null;
  if ((m = code.match(/^Key([A-Z])$/))) k = m[1];
  else if ((m = code.match(/^Digit(\d)$/))) k = m[1];
  else if (/^F\d{1,2}$/.test(code)) k = code;
  else if ((m = code.match(/^Numpad(\d)$/))) k = 'num' + m[1];
  else k = { Space: 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Home: 'Home',
    End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Insert: 'Insert', ScrollLock: 'Scrolllock', Pause: 'MediaPlayPause' }[code] || null;
  return k && !mods.includes(undefined) ? [...mods, k].join('+') : null;
}
function updateHotkeys(force) {
  const keys = (current && current.keys) || {};
  const list = [['pause', keys.pause, { act: 'pauseToggle' }], ['stop', keys.stop, { act: 'stop' }],
    ...active().map(p => [p.id, p.key, { act: 'pp', p: p.id }])];
  const conf = JSON.stringify(list.map(x => [x[0], x[1]])) + hotkeysSuspended;
  if (conf === hotkeyConf && !force) return;
  hotkeyConf = conf;
  globalShortcut.unregisterAll();
  if (hotkeysSuspended) return;
  const failed = [];
  for (const [, key, c] of list) {
    const a = accel(key);
    if (!a) continue;
    try { if (!globalShortcut.register(a, () => cmd(c))) failed.push(a); } catch { failed.push(a); }
  }
  send(mainWin, 'hotkey-failed', failed);
}

/* ---------- windows ---------- */
function showMain() {
  if (!mainWin) return;
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show(); mainWin.focus();
}
function createMain(show) {
  const wa = screen.getPrimaryDisplay().workArea;
  mainWin = new BrowserWindow({
    width: Math.round(wa.width * 0.9), height: Math.round(wa.height * 0.9), show: false,
    title: APP_NAME, icon: ICON, backgroundColor: '#17181b', autoHideMenuBar: true,
    // sandbox:false lets the preload write data.json itself (see preload.js).
    webPreferences: { preload: PRELOAD, backgroundThrottling: false, contextIsolation: true, sandbox: false },
  });
  Menu.setApplicationMenu(null);
  mainWin.loadFile(UI_FILE);
  if (show) mainWin.once('ready-to-show', () => { mainWin.maximize(); mainWin.show(); });
  // Closing the planner only hides it: the timer, hotkeys and strip keep working. Quit from the tray.
  mainWin.on('close', e => { if (!quitting) { e.preventDefault(); mainWin.hide(); } });
  mainWin.webContents.on('did-finish-load', () => updateHotkeys(true));
}
// Windows 11 doesn't allow real taskbar toolbars, so the strip is a small always-on-top window laid over the taskbar.
function barGeometry() {
  const d = screen.getPrimaryDisplay(), b = d.bounds, wa = d.workArea, W = 420;
  const th = b.y + b.height - (wa.y + wa.height);
  if (th >= 24) {
    const h = Math.max(30, th - 8);
    const x = settings.barX ?? (b.x + b.width - W - 460);
    return { x: Math.max(b.x, Math.min(x, b.x + b.width - W)), y: b.y + b.height - th + Math.round((th - h) / 2), width: W, height: h };
  }
  // Taskbar hidden or on another edge: sit in the bottom-right corner of the work area.
  return { x: wa.x + wa.width - W - 12, y: wa.y + wa.height - 46, width: W, height: 40 };
}
function createBar() {
  const g = barGeometry();
  bar = new BrowserWindow({
    ...g, frame: false, resizable: false, movable: true, skipTaskbar: true, alwaysOnTop: true, transparent: true,
    hasShadow: false, show: false, maximizable: false, minimizable: false, fullscreenable: false,
    // sandbox:false lets the preload write data.json itself (see preload.js).
    webPreferences: { preload: PRELOAD, backgroundThrottling: false, contextIsolation: true, sandbox: false },
  });
  bar.setAlwaysOnTop(true, 'screen-saver');
  bar.loadFile(path.join(__dirname, 'bar.html'));
  bar.once('ready-to-show', () => { if (settings.barVisible !== false) bar.showInactive(); });
  bar.on('moved', () => {
    // Keep the strip on the taskbar line; only its horizontal position is the user's choice.
    const [x] = bar.getPosition(), g2 = barGeometry();
    settings.barX = x; saveSettings();
    bar.setBounds({ ...g2, x });
  });
  // Clicking the taskbar raises it over the strip, so the strip is put back on top — but only while the mouse is
  // on the taskbar. Re-raising it all the time pulled focus from fullscreen games and minimized them.
  setInterval(() => {
    if (!bar || bar.isDestroyed() || !bar.isVisible()) return;
    const c = screen.getCursorScreenPoint(), d = screen.getDisplayNearestPoint(c);
    if (c.y >= d.workArea.y + d.workArea.height) { bar.setAlwaysOnTop(true, 'screen-saver'); bar.moveTop(); }
  }, 1000);
}
function toggleBar() {
  if (!bar) return;
  if (bar.isVisible()) bar.hide(); else bar.showInactive();
  settings.barVisible = bar.isVisible(); saveSettings(); updateTray();
}

/* ---------- messages from the planner and the strip ---------- */
ipcMain.on('load', e => { e.returnValue = current; });
ipcMain.on('data-path', e => { e.returnValue = DATA_DIR; });
ipcMain.on('save', (e, s) => {
  current = s; scheduleWrite();
  try { send(bar, 'state', current); updateHotkeys(); updateTray(); } catch (err) { logError('after-save', err); }
});
ipcMain.on('suspend-hotkeys', (e, v) => { hotkeysSuspended = !!v; updateHotkeys(true); });
ipcMain.on('toggle-bar', toggleBar);
ipcMain.on('alert', (e, a) => send(bar, 'alert', a));
ipcMain.on('open-data', () => shell.openPath(DATA_DIR));
// Start with Windows (hidden: tray + taskbar strip only). Same setting as the tray menu checkbox.
const LOGIN = { path: process.execPath, args: ['--hidden'] };
ipcMain.on('autostart-get', e => { e.returnValue = app.getLoginItemSettings(LOGIN).openAtLogin; });
ipcMain.on('autostart-set', (e, on) => { app.setLoginItemSettings({ ...LOGIN, openAtLogin: !!on }); updateTray(); logError('autostart', on ? 'on' : 'off'); });
ipcMain.on('open-planner', showMain);
ipcMain.on('bar-ready', () => send(bar, 'state', current));
ipcMain.on('bar-cmd', (e, c) => cmd(c));
ipcMain.on('bar-menu', () => {
  const t = current && current.timer;
  Menu.buildFromTemplate([
    ...active().map(p => ({ label: p.name, type: 'radio', checked: !!(t && t.p === p.id), click: () => cmd({ act: 'switch', p: p.id }) })),
    ...(active().length ? [] : [{ label: 'Проєктів ще немає', enabled: false }]),
    { type: 'separator' },
    { label: 'Відкрити планер', click: showMain },
    { label: 'Сховати смужку', click: toggleBar },
  ]).popup({ window: bar });
});

/* ---------- auto-tracking ----------
   watch.ps1 reports the foreground window title, idle time and fullscreen state every 5 s (read-only, no screenshots).
   - A project with "auto" on starts when its keyword has been in the foreground title for 20 s, and stops after
     60 s without it. A timer the owner started by hand is never touched by keywords.
   - Any running timer pauses after IDLE_MS without mouse/keyboard (the idle minutes are not counted) and when a
     fullscreen game/app is in front; it resumes by itself when activity returns. */
const { spawn } = require('child_process');
const IDLE_MS = 5 * 60 * 1000, MATCH_MS = 20 * 1000, LOSE_MS = 60 * 1000;
let watcher = null, matchP = null, matchSince = 0, lastMatch = 0;
const keywordsOf = p => String(p.match || p.name || '').split(',').map(s => s.trim().toLowerCase()).filter(s => s.length >= 2);
function onWatch(w) {
  if (!current) return;
  const t = current.timer, now = Date.now();
  const full = w.q === 2 || w.q === 3 || w.q === 4;
  const ownWindow = /^collabaprojects$/i.test(w.p || '');
  // 1. idle or fullscreen: pause whatever runs; remember why, so it can resume by itself
  if (t && t.s && (w.i >= IDLE_MS || (full && !ownWindow))) {
    cmd({ act: 'auto-pause', at: w.i >= IDLE_MS ? now - w.i : now, why: w.i >= IDLE_MS ? 'idle' : 'fullscreen' });
    return;
  }
  if (t && !t.s && t.autoPaused && w.i < 15000 && !full) cmd({ act: 'auto-resume' });
  if (w.i >= IDLE_MS || full) return;
  // 2. keyword matching for projects with auto-tracking on
  const title = String(w.t || '').toLowerCase();
  const hit = (current.projects || []).find(p => p.auto && !p.archived && keywordsOf(p).some(k => title.includes(k)));
  if (hit) {
    if (matchP !== hit.id) { matchP = hit.id; matchSince = now; }
    lastMatch = now;
    const manual = t && !t.auto;
    if (!manual && (!t || t.p !== hit.id) && now - matchSince >= MATCH_MS) cmd({ act: 'auto-start', p: hit.id });
  } else {
    matchP = null;
    if (t && t.auto && now - lastMatch >= LOSE_MS) cmd({ act: 'auto-stop' });
  }
}
function startWatcher() {
  // The script goes in as a -Command argument, so no execution-policy change is needed.
  const script = fs.readFileSync(path.join(__dirname, 'watch.ps1'), 'utf8');
  watcher = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
  let buf = '';
  watcher.stdout.setEncoding('utf8');
  watcher.stdout.on('data', d => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (line.startsWith('{')) { try { onWatch(JSON.parse(line)); } catch (e) { logError('watch-parse', e); } }
    }
  });
  watcher.stderr.on('data', d => logError('watch', String(d).slice(0, 300)));
  watcher.on('exit', code => { watcher = null; if (!quitting) { logError('watch', 'exited ' + code + ', restarting in 30 s'); setTimeout(startWatcher, 30000); } });
}

/* ---------- lifecycle ---------- */
app.whenReady().then(() => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  current = loadData();
  logError('start', `${process.execPath}; ${current && current.projects ? current.projects.length : 0} projects in data.json`);
  settings = readJson(SETTINGS_FILE) || {};
  createMain(!process.argv.includes('--hidden'));
  createBar();
  startWatcher();
  tray = new Tray(nativeImage.createFromPath(TRAY_ICON));
  tray.on('click', showMain);
  updateTray();
  screen.on('display-metrics-changed', () => { if (bar && !bar.isDestroyed()) bar.setBounds(barGeometry()); });
});
app.on('before-quit', () => { quitting = true; if (writeTimer) writeData(); logError('quit', 'app closed normally'); });
// A crashed planner window would silently stop saving: reload it from the file on disk.
app.on('render-process-gone', (e, wc, details) => {
  logError('renderer-gone', details.reason);
  if (mainWin && !mainWin.isDestroyed() && wc === mainWin.webContents && !quitting) mainWin.loadFile(UI_FILE);
});
app.on('will-quit', () => { globalShortcut.unregisterAll(); if (watcher) watcher.kill(); });
app.on('window-all-closed', () => {});
