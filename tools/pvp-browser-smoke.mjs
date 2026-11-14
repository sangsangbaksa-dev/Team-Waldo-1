import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

// 두 브라우저 탭으로 SPEED RUSH 1대1 대전을 끝까지 확인합니다. 네트워크 대신 `?pvp=local` 백엔드(localStorage·BroadcastChannel)를 씁니다.
const port = 4188, origin = 'http://127.0.0.1:' + port;
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
  const context = await browser.newContext({ viewport: { width: 480, height: 320 }, reducedMotion: 'reduce' });
  const errors = [];
  async function player(name) {
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    await page.goto(origin + '/?pvp=local');
    await page.click('#start-race'); await page.waitForSelector('.rc-setup');
    await page.click('[data-pick="laps:1"]'); await page.click('[data-setup="pvp"]'); await page.waitForSelector('.pvp-card');
    await page.click('[data-act="mode:up"]');
    await page.fill('input[name="nick"]', name); await page.fill('input[name="email"]', `${name}@example.dev`); await page.fill('input[name="password"]', 'secret12');
    await page.click('button[type="submit"]'); await page.waitForSelector('[data-act="quick"]');
    return page;
  }
  const a = await player('Alpha'), b = await player('Beta');
  await a.click('[data-act="quick"]'); await a.waitForSelector('.pvp-wait');
  await b.click('[data-act="quick"]');
  for (const p of [a, b]) await p.waitForSelector('.rc-root[data-phase="countdown"], .rc-root[data-phase="racing"]');
  await a.screenshot({ path: 'browser-artifacts/pvp-race-a.png' });
  for (const p of [a, b]) await p.evaluate(() => { window.__race.dbg.auto = true; });
  // 카운트다운이 끝나고 서로의 위치가 보이는지 확인
  await a.waitForFunction(() => document.querySelector('.rc-root')?.dataset.phase === 'racing');
  await sleep(2500);
  const seen = await b.evaluate(() => { const r = window.__race.race; return { names: r.racers.map(x => x.name), moved: Math.hypot(r.racers[1].car.x - r.racers[0].car.x, r.racers[1].car.z - r.racers[0].car.z) }; });
  assert.deepEqual(seen.names, ['YOU', 'Alpha']);
  const labels = [];
  // SwiftShader 에서는 화면이 느려 레이스가 슬로모션이므로, 개발용 skip() 으로 시뮬레이션을 앞당깁니다(네트워크 송수신은 그대로).
  const pump = setInterval(() => { for (const p of [a, b]) p.evaluate(() => { const r = window.__race.race; if (r.phase === 'racing') window.__race.skip(6); }).catch(() => undefined); }, 700);
  for (const [n, p] of [['a', a], ['b', b]]) {
    try { await p.waitForSelector('.rc-card h2:text-matches("승리|패배")', { timeout: 240000 }); }
    catch (e) { console.log('state', n, JSON.stringify(await p.evaluate(() => { const r = window.__race.race; return { phase: r.phase, clock: r.clock, cars: r.racers.map(x => [x.name, Math.round(x.car.total), Math.round(x.car.vf)]), vis: document.visibilityState, ui: document.querySelector('.rc-modal')?.textContent }; }))); throw e; }
  }
  await a.waitForFunction(() => /레이팅 [+-]\d+/.test(document.body.textContent || ''), null, { timeout: 40000 });
  await b.waitForFunction(() => /레이팅 [+-]\d+/.test(document.body.textContent || ''), null, { timeout: 40000 });
  for (const p of [a, b]) labels.push(await p.locator('.rc-card h2').innerText());
  const text = await Promise.all([a, b].map(p => p.locator('.rc-card').innerText()));
  await a.screenshot({ path: 'browser-artifacts/pvp-result-a.png' }); await b.screenshot({ path: 'browser-artifacts/pvp-result-b.png' });

  assert.deepEqual([...labels].sort(), ['승리', '패배'], 'exactly one winner: ' + labels);
  assert.ok(text.some(t => t.includes('+16')) && text.some(t => t.includes('-16')), 'rating delta shown: ' + text.join(' | '));
  clearInterval(pump);
  assert.deepEqual(errors, []);
  console.log('PVP SMOKE OK', labels, seen.moved.toFixed(1));
} finally { await browser?.close(); server.kill(); }
