import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

// ZERO ZONE 멀티플레이 방 종료: 사람끼리 3인 방에서 둘이 쓰러지면 남은 한 명의 경기가 끝나는지(쓰러짐 소식이 한 번 사라져도) 확인합니다.
const port = 4197, origin = 'http://127.0.0.1:' + port, out = process.env.SHOTS_DIR || 'browser-artifacts';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; for (const s of [server.stdout, server.stderr]) s.on('data', d => { log += d; });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;
await mkdir(out, { recursive: true });
try {
  let ready = false;
  for (let i = 0; i < 100 && server.exitCode === null; i++) { try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* 서버 대기 */ } await sleep(250); }
  assert.ok(ready, 'vite did not start: ' + log);
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
  const context = await browser.newContext({ viewport: { width: 800, height: 500 }, reducedMotion: 'reduce' });
  const errors = [];
  const player = async (name, fill) => {
    const page = await context.newPage(); page.setDefaultTimeout(45000);
    page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    await page.goto(origin + '/?pvp=local'); await page.click('#start-shooter'); await page.waitForSelector('.sz-setup-inner');
    await page.waitForFunction(() => !document.querySelector('[data-act="start"]')?.disabled, null, { timeout: 90000 });
    await page.click('[data-mode="room"]'); if (fill !== undefined) await page.click(`[data-fill="${fill}"]`);
    await page.click('[data-act="start"]'); await page.waitForSelector('.pvp-card');
    await page.click('[data-act="mode:up"]');
    await page.fill('input[name="nick"]', name); await page.fill('input[name="email"]', `${name}@example.dev`); await page.fill('input[name="password"]', 'secret12');
    await page.click('button[type="submit"]'); await page.waitForSelector('[data-act="newroom"]');
    return page;
  };
  const a = await player('Alpha', 0), b = await player('Beta'), c = await player('Gamma');
  await a.click('[data-act="newroom"]'); await a.waitForSelector('select[name="max"]'); await a.selectOption('select[name="max"]', '3'); await a.click('button[type="submit"]');
  await a.waitForSelector('#pvp-code'); const code = (await a.locator('#pvp-code').innerText()).trim();
  for (const p of [b, c]) { await p.fill('input[name="code"]', code.toLowerCase()); await p.click('button:has-text("코드로 입장")'); await p.waitForSelector('.pvp-members'); await p.waitForSelector('[data-act="ready"]'); await p.click('[data-act="ready"]'); }
  await a.waitForSelector('.pvp-root [data-act="start"]:not([disabled])'); await a.click('.pvp-root [data-act="start"]');
  for (const p of [a, b, c]) await p.waitForFunction(() => window.__zz?.phase === 'countdown' || window.__zz?.phase === 'play', null, { timeout: 60000 });
  for (const p of [a, b, c]) await p.evaluate(() => window.__zz.go());
  for (const p of [a, b, c]) { await p.bringToFront(); await p.waitForFunction(() => window.__zz.phase === 'play'); }
  const kill = p => p.evaluate(() => { const m = window.__zz.match, me = window.__zz.me(); m.kill(me, -1, 'zone'); });
  // Beta 의 '쓰러짐' 소식을 한 번 잃어버리는 상황: 보내는 쪽 채널의 첫 dead 를 버립니다.
  await kill(b); await sleep(2500);
  assert.equal(await a.evaluate(() => window.__zz.match.aliveCount()), 2, 'host sees Beta gone');
  await kill(c);
  await a.waitForFunction(() => window.__zz.match.over, null, { timeout: 15000 });
  const r = await a.evaluate(() => ({ over: window.__zz.match.over, win: window.__zz.match.winner, me: window.__zz.me().id }));
  assert.equal(r.win, r.me, 'Alpha wins');
  await a.waitForSelector('.sz-modal .sz-big', { timeout: 15000 }); assert.match(await a.locator('.sz-modal .sz-big').innerText(), /승리/);
  assert.deepEqual(errors, []);
  console.log('SHOOTER ROOM END SMOKE OK');
} finally { await browser?.close(); server.kill(); }
