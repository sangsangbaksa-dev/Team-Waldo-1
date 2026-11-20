import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

// FRONTLINE 공병 확인: 공병·전차를 세우고 수리 광선과 공장 생산 메뉴를 찍습니다. `node tools/rts-engineer-shot.mjs <출력 폴더>`
const out = process.argv[2] || 'browser-artifacts/rts-engineer', port = 4198, origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;
await mkdir(out, { recursive: true });
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) break; } catch { /* 서버 대기 */ } await sleep(250); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage(); page.setDefaultTimeout(60000);
  page.on('pageerror', e => errors.push(e.message)); await page.goto(origin);
  await page.click('#start-rts'); await page.waitForSelector('.rt-setup'); await page.click('[data-diff="easy"]'); await page.click('#rt-start'); await page.waitForSelector('.rt-root[data-phase="play"]'); await sleep(800);
  await page.evaluate(() => {
    const r = window.__rts, s = r.sim, hq = s.buildings.find(b => b.owner === 0 && b.kind === 'hq');
    const site = s.findSite('barracks', hq.x + 2, hq.y + 2); s.addBuilding(0, 'barracks', site.x, site.y, true);
    const fs = s.findSite('factory', hq.x - 6, hq.y + 2); const fac = s.addBuilding(0, 'factory', fs.x, fs.y, true); fac.hp = fac.maxhp * 0.4;
    const cx = hq.x + 2, cy = hq.y + 9;
    const eng = s.spawnAt(0, 'engineer', cx, cy), tank = s.spawnAt(0, 'tank', cx + 2, cy), jeep = s.spawnAt(0, 'jeep', cx + 2, cy + 2.5);
    tank.hp = 60; jeep.hp = 30; eng.o.t = 'idle'; r.view.focus?.(cx, cy);
    r.select([eng.id]); window.__eid = eng.id; window.__fid = fac.id;
  });
  await sleep(600); await page.screenshot({ path: `${out}/select.png` });
  await page.evaluate(() => { const s = window.__rts.sim; for (let i = 0; i < 25; i++) s.step(); }); await sleep(500); await page.screenshot({ path: `${out}/repair.png` });
  await page.evaluate(() => window.__rts.select([window.__fid])); await sleep(500); await page.screenshot({ path: `${out}/factory.png` });
  console.log('errors', errors);
} finally { await browser?.close(); server.kill(); }
