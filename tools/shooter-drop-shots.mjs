import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

// ZERO ZONE 낙하 장면 스크린샷: 비행기 안 · 자유낙하 · 낙하산 · 착지 · 번개. `node tools/shooter-drop-shots.mjs <출력 폴더>`
const out = process.argv[2] || 'browser-artifacts/shooter-drop', port = 4191, origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;
await mkdir(out, { recursive: true });
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) break; } catch { /* 서버 대기 */ } await sleep(250); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 1100, height: 620 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => { let s = 20261117; Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
  const errors = [];
  const page = await context.newPage(); page.setDefaultTimeout(90000); page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/'); await page.click('#start-shooter'); await page.waitForSelector('.sz-setup-inner');
  await page.waitForFunction(() => !document.querySelector('[data-act="start"]')?.disabled, null, { timeout: 90000 });
  await page.click('[data-level="easy"]'); await page.click('[data-act="start"]');
  await page.waitForFunction(() => window.__zz?.phase === 'countdown' || window.__zz?.phase === 'play');
  await page.evaluate(() => window.__zz.go()); await page.waitForFunction(() => window.__zz.phase === 'play');
  const step = async sec => page.evaluate(s => { const m = window.__zz.match; for (let i = 0; i < s * 30; i++) { m.step(1 / 30); m.drain(); } }, sec);
  await page.evaluate(() => { window.__zz.look(0.9, -0.12); }); await sleep(600);
  await page.screenshot({ path: out + '/1-plane.png' });
  await page.keyboard.down('Space'); await sleep(900); await page.keyboard.up('Space');
  await page.evaluate(() => { window.__zz.look(0.5, -0.9); }); await step(1.5); await sleep(500);
  await page.screenshot({ path: out + '/2-freefall.png' });
  await page.evaluate(() => { const me = window.__zz.me(); me.alt = 90; }); await step(2); await page.evaluate(() => window.__zz.look(0.5, -0.25)); await sleep(600);
  await page.screenshot({ path: out + '/3-chute.png' });
  await page.evaluate(() => { const m = window.__zz.match; for (const p of m.players) if (p.id !== 0 && p.air === 3) { p.alt = Math.min(p.alt, 30); } });
  await step(30); await page.evaluate(() => window.__zz.look(0.5, 0.0)); await sleep(600);
  await page.screenshot({ path: out + '/4-landed.png' });
  const info = await page.evaluate(() => { const m = window.__zz.match, me = window.__zz.me(); return { alive: m.aliveCount(), air: m.players.filter(p => p.air).length, me: { air: me.air, alt: me.alt } }; });
  console.log(JSON.stringify(info), 'errors:', errors.length ? errors : 'none');
} finally { await browser?.close(); server.kill(); }
