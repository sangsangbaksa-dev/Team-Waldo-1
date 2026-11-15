import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

// ZERO ZONE: (1) 솔로 배틀로열이 시작되고 HUD 가 뜨는지, (2) 두 브라우저 탭이 `?pvp=local` 백엔드로 1대1 대전을 끝까지 치르는지 확인합니다.
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
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
  const context = await browser.newContext({ viewport: { width: 640, height: 400 }, reducedMotion: 'reduce' });
  const errors = [];
  const open = async name => {
    const page = await context.newPage(); page.setDefaultTimeout(45000);
    page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    await page.goto(origin + '/?pvp=local'); await page.click('#start-shooter'); await page.waitForSelector('.sz-setup-inner');
    await page.waitForFunction(() => !document.querySelector('[data-act="start"]')?.disabled, null, { timeout: 90000 });
    return page;
  };

  // 1) 솔로
  const solo = await open('solo');
  await solo.click('[data-level="easy"]'); await solo.click('[data-act="start"]');
  await solo.waitForFunction(() => window.__zz?.phase === 'play', null, { timeout: 60000 }).catch(async () => { await solo.evaluate(() => window.__zz?.go()); await solo.waitForFunction(() => window.__zz?.phase === 'play'); });
  const n = await solo.evaluate(() => window.__zz.match.players.length);
  assert.equal(n, 20, 'solo has 20 players');
  await solo.screenshot({ path: 'browser-artifacts/shooter-solo.png' });
  await solo.close();

  // 2) 1대1
  const player = async name => {
    const page = await open(name);
    await page.click('[data-mode="pvp"]'); await page.click('[data-act="start"]'); await page.waitForSelector('.pvp-card');
    await page.click('[data-act="mode:up"]');
    await page.fill('input[name="nick"]', name); await page.fill('input[name="email"]', `${name}@example.dev`); await page.fill('input[name="password"]', 'secret12');
    await page.click('button[type="submit"]'); await page.waitForSelector('[data-act="quick"]');
    return page;
  };
  const a = await player('Alpha'), b = await player('Beta');
  await a.click('[data-act="quick"]'); await a.waitForSelector('.pvp-wait');
  await b.click('[data-act="quick"]');
  for (const p of [a, b]) await p.waitForFunction(() => window.__zz?.phase === 'countdown' || window.__zz?.phase === 'play', null, { timeout: 60000 });
  for (const p of [a, b]) await p.evaluate(() => window.__zz.go());
  for (const p of [a, b]) await p.waitForFunction(() => window.__zz.phase === 'play');
  // B 를 A 의 정면 8m 앞으로 옮겨 놓고, A 가 쏩니다(맞았는지는 B 쪽 판정이 결정).
  const pa = await a.evaluate(() => { const m = window.__zz.me(); return { x: m.x, z: m.z, yaw: m.yaw }; });
  await b.evaluate(({ x, z, yaw }) => { const m = window.__zz.me(); m.x = x + Math.cos(yaw) * 8; m.z = z + Math.sin(yaw) * 8; }, pa);
  await sleep(1500);
  const seen = await a.evaluate(() => { const g = window.__zz.match, me = window.__zz.me(), o = g.players.find(p => p.id !== me.id); return { d: Math.hypot(o.x - me.x, o.z - me.z) }; });
  assert.ok(seen.d > 2 && seen.d < 25, 'opponent pose arrived: ' + seen.d);
  await a.screenshot({ path: 'browser-artifacts/shooter-pvp-a.png' });
  await a.evaluate(() => { const g = window.__zz.match, me = window.__zz.me(), o = g.players.find(p => p.id !== me.id); me.guns[me.cur] = { id: 'rifle', mag: 30, reserve: 300 }; window.__zz.look(Math.atan2(o.z - me.z, o.x - me.x), Math.atan2(1.2 - 1.65, Math.hypot(o.x - me.x, o.z - me.z))); window.__zz.fire(true); });
  let flip = false; const front = setInterval(() => { flip = !flip; (flip ? a : b).bringToFront().catch(() => undefined); }, 1500);
  const pump = setInterval(() => { for (const p of [a, b]) p.evaluate(() => { const g = window.__zz.match, me = window.__zz.me(), o = g.players.find(q => q.id !== me.id); if (me.id === g.players[0].id) { window.__zz.fire(true); window.__zz.look(Math.atan2(o.z - me.z, o.x - me.x), Math.atan2(1.2 - 1.65, Math.hypot(o.x - me.x, o.z - me.z))); } }).catch(() => undefined); }, 400);
  if (process.env.SMOKE_PROBE) for (let i = 0; i < 4; i++) { await sleep(4000); for (const [n2, q] of [['a', a], ['b', b]]) console.log('probe', i, n2, JSON.stringify(await q.evaluate(() => { const m = window.__zz.me(); return { vis: document.visibilityState, frames: window.__zz.view.frames, t: +window.__zz.match.t.toFixed(2), hp: window.__zz.match.players.map(x => Math.round(x.hp)), mag: m.guns[m.cur]?.mag, hits: window.__zz.match.players.map(x => x.kills) }; }))); }
  const labels = [];
  for (const p of [a, b]) {
    try { await p.waitForSelector('.sz-card h2:text-matches("승리|패배")', { timeout: Number(process.env.SMOKE_WAIT || 120000) }); }
    catch (e) { for (const [n2, q] of [['a', a], ['b', b]]) console.log('state', n2, JSON.stringify(await q.evaluate(() => { const m = window.__zz.me(); return { phase: window.__zz.phase, t: window.__zz.match.t, me: [m.name, m.x, m.z, m.yaw, m.hp, m.guns[m.cur]], players: window.__zz.match.players.map(x => [x.name, Math.round(x.hp), x.x.toFixed(1), x.z.toFixed(1), x.alive]) }; }))); throw e; }
  }
  await a.waitForFunction(() => /레이팅 [+-]\d+/.test(document.body.textContent || ''), null, { timeout: 40000 });
  await b.waitForFunction(() => /레이팅 [+-]\d+/.test(document.body.textContent || ''), null, { timeout: 40000 });
  for (const p of [a, b]) labels.push(await p.locator('.sz-card h2').innerText());
  await a.screenshot({ path: 'browser-artifacts/shooter-pvp-result-a.png' });
  const why = await Promise.all([a, b].map(p => p.locator('.sz-card').innerText())); console.log(why.map(t => t.replace(/\n+/g, ' | ')).join('\n'));
  clearInterval(pump); clearInterval(front);
  assert.deepEqual([...labels].sort(), ['승리', '패배'], 'exactly one winner: ' + labels);
  assert.deepEqual(errors, []);
  console.log('SHOOTER SMOKE OK', labels);
} finally { await browser?.close(); server.kill(); }
