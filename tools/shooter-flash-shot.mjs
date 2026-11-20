import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

// ZERO ZONE 섬광탄 확인: 섬광탄을 던져 눈이 멀었을 때 화면이 하얘지는지 확인합니다. `node tools/shooter-flash-shot.mjs <출력 폴더>`
const out = process.argv[2] || 'browser-artifacts/shooter-flash', port = 4198, origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;
await mkdir(out, { recursive: true });
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) break; } catch { /* 서버 대기 */ } await sleep(250); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1100, height: 620 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => { let s = 20261117; Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
  const errors = [];
  const page = await context.newPage(); page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/'); await page.click('#start-shooter'); await page.waitForSelector('.sz-setup-inner');
  await page.waitForFunction(() => !document.querySelector('[data-act="start"]')?.disabled, null, { timeout: 90000 });
  await page.click('[data-level="easy"]'); await page.click('[data-act="start"]');
  await page.waitForFunction(() => window.__zz?.phase === 'countdown' || window.__zz?.phase === 'play');
  await page.evaluate(() => window.__zz.go()); await page.waitForFunction(() => window.__zz.phase === 'play');
  await page.evaluate(() => { for (const p of window.__zz.match.players) { p.air = 0; p.alt = 0; } }); // 장면 촬영은 땅에서 시작
  await page.evaluate(() => { const z = window.__zz, m = z.match, me = z.me(), c = m.map.compounds[0]; me.x = c.x - 30; me.z = c.z + 4; me.hp = 100; me.flashes = 3; me.cd = 0; for (const p of m.players) if (p.id !== me.id) { p.x = 9999; p.z = 9999; } z.look(0, 0.42); });
  await sleep(800); await page.screenshot({ path: `${out}/before.png` });
  await page.keyboard.press('KeyV'); await sleep(500);
  await page.evaluate(() => { const m = window.__zz.match; for (let i = 0; i < 40; i++) m.step(1 / 30); const me = window.__zz.me(); me.blind = 3; }); await sleep(300);
  await page.screenshot({ path: `${out}/blind.png` });
  const info = await page.evaluate(() => { const me = window.__zz.me(); return { flashes: me.flashes, blind: me.blind, op: document.querySelector('#sz-flashfx')?.style.opacity, hud: document.querySelector('#sz-slots')?.textContent }; });
  console.log(JSON.stringify(info), 'errors', errors);
} finally { await browser?.close(); server.kill(); }
