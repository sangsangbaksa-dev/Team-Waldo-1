import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

// FRONTLINE 라인전 방(3인 협동 vs AI)을 `?pvp=local` 백엔드로 확인합니다: 방 만들기 → 입장 → 준비 → 시작 → 챔피언 준비 → 락스텝으로 세 화면이 같은 상태로 진행.
const port = 4195, origin = 'http://127.0.0.1:' + port;
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
  const context = await browser.newContext({ viewport: { width: 1000, height: 1100 }, reducedMotion: 'reduce' });
  const errors = [];
  async function player(name) {
    const page = await context.newPage(); page.setDefaultTimeout(60000);
    page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    await page.goto(origin + '/?pvp=local');
    await page.click('#start-rts'); await page.waitForSelector('#rt-mobaroom'); await page.click('#rt-mobaroom'); await page.waitForSelector('.pvp-card');
    await page.click('[data-act="mode:up"]');
    await page.fill('input[name="nick"]', name); await page.fill('input[name="email"]', `${name}@example.dev`); await page.fill('input[name="password"]', 'secret12');
    await page.click('button[type="submit"]'); await page.waitForSelector('[data-act="newroom"]');
    return page;
  }
  const [a, b, c] = [await player('Alpha'), await player('Beta'), await player('Gamma')];
  await a.click('[data-act="newroom"]'); await a.waitForSelector('select[name="max"]'); await a.selectOption('select[name="max"]', '3'); await a.click('button[type="submit"]');
  await a.waitForSelector('#pvp-code'); const code = (await a.locator('#pvp-code').innerText()).trim();
  await b.waitForSelector('[data-act^="enter:"]'); await b.click('[data-act^="enter:"]'); await b.waitForSelector('.pvp-members');
  await c.fill('input[name="code"]', code.toLowerCase()); await c.click('button:has-text("코드로 입장")'); await c.waitForSelector('.pvp-members');
  await a.waitForFunction(() => document.querySelectorAll('.pvp-members li.empty').length === 0);
  await b.click('[data-act="ready"]'); await c.click('[data-act="ready"]', { timeout: 8000 }).catch(async () => { console.log('C STATE', await c.locator('.pvp-root').innerText()); throw new Error('c ready'); });
  await a.waitForSelector('.pvp-root [data-act="start"]:not([disabled])'); await a.click('.pvp-root [data-act="start"]');
  for (const p of [a, b, c]) { await p.waitForSelector('#mb-start'); await p.screenshot({ path: 'browser-artifacts/moba-room-setup.png' }); await p.click('#mb-start'); }
  for (const p of [a, b, c]) await p.waitForSelector('.mb-root[data-phase="play"]', { timeout: 60000 });
  const humans = await Promise.all([a, b, c].map(p => p.evaluate(() => window.__moba.sim.heroes(0).filter(h => !h.hero.bot).length)));
  assert.deepEqual(humans, [3, 3, 3]);
  const metas = await Promise.all([a, b, c].map(p => p.evaluate(() => window.__moba.sim.heroIds.indexOf(window.__moba.sim.meId))));
  assert.deepEqual([...metas].sort(), [0, 1, 2]);
  await sleep(6000);
  const ticks = await Promise.all([a, b, c].map(p => p.evaluate(() => window.__moba.sim.tick)));
  assert.ok(ticks.every(t => t >= 9), 'ticks advance: ' + ticks);
  await a.screenshot({ path: 'browser-artifacts/moba-room-play.png' });
  assert.deepEqual(errors, []);
  console.log('FRONTLINE ROOM OK', ticks, metas);
} finally { await browser?.close(); server.kill(); }
