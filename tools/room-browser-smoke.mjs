import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

// 멀티플레이 방을 두 시나리오로 끝까지 확인합니다(`?pvp=local` 백엔드): ① 3인 방(공개 목록 → 입장 → 준비 → 시작 → 순위표), ② 2인 방(1대1 매치와 레이팅).
const port = 4189, origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; for (const s of [server.stdout, server.stderr]) s.on('data', d => { log += d; });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;
await mkdir('browser-artifacts', { recursive: true });
try {
  let ready = false;
  for (let i = 0; i < 100 && server.exitCode === null; i++) { try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* 서버 대기 */ } await sleep(250); }
  assert.ok(ready, 'vite did not start: ' + log);
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 480, height: 640 }, reducedMotion: 'reduce' });
  const errors = [];
  async function player(name) {
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    await page.goto(origin + '/?pvp=local');
    await page.click('#start-race'); await page.waitForSelector('.rc-setup');
    await page.click('[data-pick="laps:1"]'); await page.click('[data-setup="pvp"]'); await page.waitForSelector('.pvp-card');
    await page.click('[data-act="mode:up"]');
    await page.fill('input[name="nick"]', name); await page.fill('input[name="email"]', `${name}@example.dev`); await page.fill('input[name="password"]', 'secret12');
    await page.click('button[type="submit"]'); await page.waitForSelector('[data-act="newroom"]');
    return page;
  }
  const pump = pages => setInterval(() => { for (const p of pages) p.evaluate(() => { const r = window.__race?.race; if (r && r.phase === 'racing') window.__race.skip(6); }).catch(() => undefined); }, 700);

  // ① 3인 방
  const [a, b, c] = [await player('Alpha'), await player('Beta'), await player('Gamma')];
  await a.click('[data-act="newroom"]'); await a.waitForSelector('select[name="max"]'); await a.selectOption('select[name="max"]', '3'); await a.click('button[type="submit"]');
  await a.waitForSelector('#pvp-code'); const code = (await a.locator('#pvp-code').innerText()).trim(); assert.match(code, /^[A-Z0-9]{5}$/);
  await b.waitForSelector('[data-act^="enter:"]'); // 공개 방 목록에 보임
  await b.click('[data-act^="enter:"]'); await b.waitForSelector('.pvp-members');
  await c.fill('input[name="code"]', code.toLowerCase()); await c.click('button:has-text("코드로 입장")'); await c.waitForSelector('.pvp-members');
  await a.waitForFunction(() => document.querySelectorAll('.pvp-members li.me, .pvp-members li').length >= 3 && document.querySelectorAll('.pvp-members li.empty').length === 0);
  assert.equal(await a.locator('[data-act="start"]').isDisabled(), true, 'host cannot start before everyone is ready');
  await b.click('[data-act="ready"]'); await c.click('[data-act="ready"]');
  await a.waitForSelector('[data-act="start"]:not([disabled])'); await a.screenshot({ path: 'browser-artifacts/room-lobby.png' });
  await a.click('[data-act="start"]');
  for (const p of [a, b, c]) await p.waitForSelector('.rc-root[data-phase="countdown"], .rc-root[data-phase="racing"]');
  await a.screenshot({ path: 'browser-artifacts/room-race-a.png' });
  for (const p of [a, b, c]) await p.evaluate(() => { window.__race.dbg.auto = true; });
  const names = await b.evaluate(() => window.__race.race.racers.map(x => x.name).sort());
  assert.deepEqual(names, ['Alpha', 'Gamma', 'YOU']);
  let t = pump([a, b, c]);
  for (const p of [a, b, c]) await p.waitForSelector('.rc-board li', { timeout: 240000 });
  clearInterval(t);
  const rows = await Promise.all([a, b, c].map(p => p.locator('.rc-board li').count()));
  assert.deepEqual(rows, [3, 3, 3]);
  await a.screenshot({ path: 'browser-artifacts/room-result-a.png' });
  console.log('ROOM 3P OK', await a.locator('.rc-board').innerText());
  await Promise.all([a, b, c].map(p => p.close()));

  // ② 2인 방: 1대1 매치(레이팅)
  const [d, e] = [await player('Delta'), await player('Echo')];
  await d.click('[data-act="newroom"]'); await d.waitForSelector('select[name="max"]'); await d.click('button[type="submit"]'); await d.waitForSelector('#pvp-code');
  await e.waitForSelector('[data-act^="enter:"]'); await e.click('[data-act^="enter:"]'); await e.click('[data-act="ready"]');
  await d.waitForSelector('[data-act="start"]:not([disabled])'); await d.click('[data-act="start"]');
  for (const p of [d, e]) await p.waitForSelector('.rc-root[data-phase="countdown"], .rc-root[data-phase="racing"]');
  for (const p of [d, e]) await p.evaluate(() => { window.__race.dbg.auto = true; });
  t = pump([d, e]);
  for (const p of [d, e]) await p.waitForSelector('.rc-card h2:text-matches("승리|패배")', { timeout: 240000 });
  for (const p of [d, e]) await p.waitForFunction(() => /레이팅 [+-]\d+/.test(document.body.textContent || ''), null, { timeout: 40000 });
  clearInterval(t);
  const heads = [await d.locator('.rc-card h2').innerText(), await e.locator('.rc-card h2').innerText()];
  assert.deepEqual([...heads].sort(), ['승리', '패배']);
  assert.deepEqual(errors, []);
  console.log('ROOM SMOKE OK', heads);
} finally { await browser?.close(); server.kill(); }
