// Generates the app icons from assets/logo.webp. Run once after changing the logo: npx electron make-icons.js
// Small sizes (≤48 px) use only the green "P" on the blue square, because the vertical COLLABA text is unreadable there.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const A = path.join(__dirname, 'assets');

function ico(pngs) {
  // ICO with PNG-compressed entries (supported since Windows Vista).
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let off = head.length;
  pngs.forEach(([s, buf], i) => {
    const e = 6 + i * 16;
    head.writeUInt8(s >= 256 ? 0 : s, e); head.writeUInt8(s >= 256 ? 0 : s, e + 1);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(buf.length, e + 8); head.writeUInt32LE(off, e + 12);
    off += buf.length;
  });
  return Buffer.concat([head, ...pngs.map(p => p[1])]);
}

app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false });
  await w.loadURL('about:blank');
  const src = 'data:image/webp;base64,' + fs.readFileSync(path.join(A, 'logo.webp')).toString('base64');
  const out = await w.webContents.executeJavaScript(`(async () => {
    const img = new Image(); img.src = ${JSON.stringify(src)}; await img.decode();
    const k = img.naturalWidth / 1075;            // crop coordinates below are measured on the 1075 px original
    const probe = document.createElement('canvas'); probe.width = probe.height = 1;
    probe.getContext('2d').drawImage(img, 20 * k, 20 * k, 1, 1, 0, 0, 1, 1);
    const [r, g, b] = probe.getContext('2d').getImageData(0, 0, 1, 1).data;
    const blue = 'rgb(' + r + ',' + g + ',' + b + ')';
    const P = [500 * k, 150 * k, 345 * k, 695 * k]; // the green P
    const full = s => { const c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, s, s); return c.toDataURL('image/png'); };
    const small = s => { const c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high'; const rad = s * 0.2;
      x.fillStyle = blue; x.beginPath(); x.roundRect(0, 0, s, s, rad); x.fill();
      const h = s * 0.74, wd = h * P[2] / P[3];
      x.drawImage(img, P[0], P[1], P[2], P[3], (s - wd) / 2, (s - h) / 2, wd, h); return c.toDataURL('image/png'); };
    const o = {}; for (const s of [16, 24, 32, 48, 64]) o['s' + s] = small(s);
    for (const s of [64, 128, 256]) o['f' + s] = full(s);
    return o;
  })()`);
  const buf = d => Buffer.from(d.split(',')[1], 'base64');
  fs.writeFileSync(path.join(A, 'icon.ico'), ico([[16, buf(out.s16)], [24, buf(out.s24)], [32, buf(out.s32)], [48, buf(out.s48)],
    [64, buf(out.f64)], [128, buf(out.f128)], [256, buf(out.f256)]]));
  fs.writeFileSync(path.join(A, 'tray.png'), buf(out.s16));
  fs.writeFileSync(path.join(A, 'tray@2x.png'), buf(out.s32));
  fs.writeFileSync(path.join(A, 'icon-256.png'), buf(out.f256));
  fs.writeFileSync(path.join(A, 'mark-64.png'), buf(out.s64));
  console.log('Icons written to', A);
  app.quit();
});
