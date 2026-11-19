import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

// LAST CITY 건설 고스트 확인: 1인칭에서 건물 종류별 고스트를 눈앞(가까운 시선·먼 시선)에 띄워 찍는다. `node tools/city-ghost-shot.mjs <출력 폴더>`
const out = process.argv[2] || 'browser-artifacts/city-ghost', port = 4194, origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;
await mkdir(out, { recursive: true });
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) break; } catch { /* 서버 대기 */ } await sleep(250); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1100, height: 620 } });
  const errors = [];
  const page = await context.newPage(); page.setDefaultTimeout(90000); page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(origin + '/'); await page.locator('#start-city').click(); await page.locator('.c-setup').waitFor();
  await page.locator('[data-act="class:warlord"]').click(); await page.locator('.city-hud').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !!window.__city?.world && !!window.__city.r3);
  await sleep(2000);
  const info = await page.evaluate(() => { const c = window.__city; return { keys: Object.keys(c), mode: c.r3.mode, hq: !!c.world.hq(0) }; });
  await page.evaluate(() => { const f = window.__city.world.factions[0]; f.crystal = 5000; f.cash = 5000; });
  console.log(info); await page.screenshot({ path: `${out}/start.png` });
  for (const kind of ['barracks', 'factory', 'turret']) {
    for (const pitch of [0.02, -0.12, -0.3, -1.0]) {
      await page.keyboard.press('b'); await sleep(300); if (!(await page.locator(`[data-act="build:${kind}"]`).count())) { await page.screenshot({ path: `${out}/nopanel.png` }); console.log('no build panel'); break; }
      await page.locator(`[data-act="build:${kind}"]`).click({ force: true });
      await page.evaluate(({ pitch }) => { const c = window.__city, b = c.world.boss(0), hq = c.world.hq(0); if (hq && b) { b.x = hq.x + hq.w / 2 + 160; b.y = hq.y + hq.h / 2; } c.r3.yaw = Math.PI; c.r3.pitch = pitch; c.r3.mode = 'fp'; }, { pitch });
      await sleep(900);
      await page.screenshot({ path: `${out}/${kind}-${pitch}.png` });
    }
  }
  console.log('errors', errors);
} finally { await browser?.close(); server.kill(); }
