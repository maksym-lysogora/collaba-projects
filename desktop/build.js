// Builds the portable app into ../dist/CollabaProjects-win32-x64 (a folder: run CollabaProjects.exe, no installer).
// It copies the Electron runtime and puts our files in resources/app. The planner page is copied from ../tydzen.html,
// so the browser test file and the app always share one source.
// (Done by hand rather than with @electron/packager: its zip extraction stops silently under Node 24.)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const runtime = path.join(__dirname, 'node_modules', 'electron', 'dist');
const out = path.join(root, 'dist', 'CollabaProjects-win32-x64');
const exe = path.join(out, 'CollabaProjects.exe');
const appDir = path.join(out, 'resources', 'app');
const FILES = ['main.js', 'preload.js', 'bar.html'];
const ASSETS = ['icon.ico', 'tray.png', 'tray@2x.png'];
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

if (!fs.existsSync(path.join(runtime, 'electron.exe'))) {
  console.error('Electron runtime not found in node_modules/electron/dist. Run npm install first.');
  process.exit(1);
}
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(runtime, out, { recursive: true });
fs.renameSync(path.join(out, 'electron.exe'), exe);
fs.rmSync(path.join(out, 'resources', 'default_app.asar'), { force: true });
fs.mkdirSync(path.join(appDir, 'assets'), { recursive: true });
for (const f of FILES) fs.copyFileSync(path.join(__dirname, f), path.join(appDir, f));
for (const f of ASSETS) fs.copyFileSync(path.join(__dirname, 'assets', f), path.join(appDir, 'assets', f));
fs.copyFileSync(path.join(root, 'tydzen.html'), path.join(appDir, 'tydzen.html'));
fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ name: pkg.name, productName: pkg.productName, version: pkg.version, main: 'main.js' }, null, 2));

// Logo and name inside the .exe (Explorer, taskbar, Alt+Tab).
execFileSync(path.join(__dirname, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe'), [exe,
  '--set-icon', path.join(__dirname, 'assets', 'icon.ico'),
  '--set-file-version', pkg.version, '--set-product-version', pkg.version,
  '--set-version-string', 'FileDescription', pkg.productName,
  '--set-version-string', 'ProductName', pkg.productName,
  '--set-version-string', 'OriginalFilename', 'CollabaProjects.exe',
  '--set-version-string', 'CompanyName', 'Collaba',
]);
console.log('Built:', out);
