// Runs after `npm install`. Under Node 24 Electron's own installer downloads its runtime but stops extracting it silently,
// leaving no electron.exe. If that happened, unpack the downloaded archive here. Otherwise this does nothing.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const pkg = path.join(__dirname, 'node_modules', 'electron');
const dist = path.join(pkg, 'dist');
if (fs.existsSync(path.join(dist, 'electron.exe'))) process.exit(0);

execFileSync(process.execPath, [path.join(pkg, 'install.js')], { stdio: 'inherit' }); // makes sure the archive is in the cache
if (fs.existsSync(path.join(dist, 'electron.exe'))) process.exit(0);

const { version } = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8'));
const name = `electron-v${version}-win32-x64.zip`;
const cache = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'electron', 'Cache');
const find = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? find(path.join(d, e.name)) : e.name === name ? [path.join(d, e.name)] : []);
const zip = fs.existsSync(cache) ? find(cache)[0] : null;
if (!zip) { console.error(`Could not find ${name} in ${cache}. Delete node_modules and run npm install again.`); process.exit(1); }

fs.rmSync(dist, { recursive: true, force: true });
execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
  `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${dist}' -Force`], { stdio: 'inherit' });
fs.writeFileSync(path.join(pkg, 'path.txt'), 'electron.exe');
console.log('Electron runtime unpacked.');
