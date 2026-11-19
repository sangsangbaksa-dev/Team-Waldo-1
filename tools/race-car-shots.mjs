// SPEED RUSH 차량 모델 스크린샷(개발용): node tools/race-car-shots.mjs <glb> <출력폴더> 이름,차,각도,높이,거리 ...
// 예) node tools/race-car-shots.mjs public/assets/models/race.glb out gt-34,gt,0.8,1.5,8.5 gt-rear,gt,-2.5,1.5,8.5
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, copyFileSync, rmSync } from 'node:fs';
const [glb, out, ...specs] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
copyFileSync(glb, 'public/__preview.glb');
const port = 5301, origin = `http://127.0.0.1:${port}/`;
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 80; i++) { try { if ((await fetch(origin)).ok) break; } catch { /* wait */ } await sleep(250); }
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 600 } })).newPage();
  await page.goto(`${origin}tools/race-car-preview.html?glb=/__preview.glb`);
  await page.waitForFunction(() => window.__ready || window.__err, null, { timeout: 60000 });
  const err = await page.evaluate(() => window.__err); if (err) throw new Error(err);
  for (const s of specs) { const [name, car, yaw, h, dist, look] = s.split(','); await page.evaluate(a => window.__shot(...a), [car, +yaw, +h, +dist, look ? +look : 0.55]); await page.screenshot({ path: `${out}/${name}.png` }); }
} finally { await browser.close(); server.kill(); rmSync('public/__preview.glb', { force: true }); }
