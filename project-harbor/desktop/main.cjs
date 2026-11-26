const { app, BrowserWindow, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.glb': 'model/gltf-binary',
};

function siteRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'dist')
    : path.resolve(__dirname, '../../dist');
}

function startServer(root) {
  const base = path.resolve(root);
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let pathname = '/';
      try { pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname); }
      catch { res.writeHead(400); res.end(); return; }
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = path.resolve(base, pathname.replace(/^[/\\]+/, ''));
      if (file !== base && !file.startsWith(base + path.sep)) {
        res.writeHead(403); res.end(); return;
      }
      fs.readFile(file, (error, data) => {
        if (error) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, port: typeof address === 'object' && address ? address.port : 0 });
    });
  });
}

app.whenReady().then(async () => {
  const { port } = await startServer(siteRoot());
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Project Harbor',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  const local = `http://127.0.0.1:${port}/`;
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(local)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(local)) return;
    event.preventDefault();
    shell.openExternal(url);
  });
  const shot = process.env.HARBOR_SHOT || '';
  const query = shot ? `?shot=${encodeURIComponent(shot)}` : '';
  if (shot) win.webContents.setBackgroundThrottling(false);
  win.webContents.on('console-message', (_event, _level, message) => {
    if (shot) console.log(message);
  });
  await win.loadURL(`${local}project-harbor/desktop/shell.html${query}`);
  if (shot && process.env.HARBOR_SHOT_OUT) {
    await new Promise(resolve => setTimeout(resolve, Number(process.env.HARBOR_SHOT_WAIT || 8000)));
    const image = await win.webContents.capturePage();
    fs.writeFileSync(process.env.HARBOR_SHOT_OUT, image.toPNG());
    app.quit();
  }
});

app.on('window-all-closed', () => app.quit());
