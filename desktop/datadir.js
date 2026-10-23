// Where the tracker keeps its data: <project folder>/data, next to tydzen.html and desktop/.
// Not %APPDATA%: Windows can show a program a private, virtual copy of AppData (that is how two launches of the
// same app ended up with different data). An ordinary folder on the project drive is the same for every launch,
// and the owner can open data.json himself. Used by main.js and preload.js so both always agree.
const fs = require('fs');
const path = require('path');
const os = require('os');

function projectDir(start) {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'tydzen.html')) && fs.existsSync(path.join(dir, 'desktop'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

// Fallback only when the program was copied away from its project folder.
const LEGACY_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'CollabaProjects');
const project = projectDir(__dirname);
const DATA_DIR = project ? path.join(project, 'data') : LEGACY_DIR;

module.exports = { DATA_DIR, LEGACY_DIR };
