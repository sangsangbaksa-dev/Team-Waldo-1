import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

// ZERO ZONE 연막탄 확인: 연막탄을 던져 연막이 깔린 장면을 찍고, 연막 너머 AI 의 시선이 끊기는지 확인합니다. `node tools/shooter-smoke-shot.mjs <출력 폴더>`
const out = process.argv[2] || 'browser-artifacts/shooter-smoke', port = 4197, origin = 'http://127.0.0.1:' + port;
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
  await page.evaluate(() => { const z = window.__zz, m = z.match, me = z.me(), c = m.map.compounds[0]; me.x = c.x - 30; me.z = c.z + 4; me.hp = 100; me.smokes = 3; me.cd = 0; for (const p of m.players) if (p.id !== me.id) { p.x = 9999; p.z = 9999; } z.look(0, 0.42); });
  await sleep(800); await page.screenshot({ path: `${out}/before.png` });
  await page.keyboard.press('KeyB'); await sleep(700);
  // 헤드리스는 프레임이 느려 시뮬레이션 시간이 천천히 가므로, 퓨즈가 끝날 때까지 직접 시간을 돌립니다.
  await page.evaluate(() => { const m = window.__zz.match; for (let i = 0; i < 110; i++) m.step(1 / 30); }); await sleep(900);
  await page.screenshot({ path: `${out}/thrown.png` }); await page.evaluate(() => { const m = window.__zz.match; for (let i = 0; i < 60; i++) m.step(1 / 30); }); await sleep(900);
  await page.screenshot({ path: `${out}/cloud.png` });
  const info = await page.evaluate(() => { const m = window.__zz.match, me = window.__zz.me(); return { smokes: me.smokes, clouds: m.clouds.length, hud: document.querySelector('#sz-slots')?.textContent }; });
  console.log(JSON.stringify(info), 'errors', errors);
} finally { await browser?.close(); server.kill(); }
