import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

// 두 탭으로 FRONTLINE 1대1 락스텝을 확인합니다: 가입 → 매칭 → 같은 시작 → 서로 다른 명령을 내리고 → 상태 해시가 같은지 → 항복 → 결과.
// `?pvp=local` 개발용 백엔드를 씁니다.
const port = 4192, origin = 'http://127.0.0.1:' + port;
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
  const context = await browser.newContext({ viewport: { width: 960, height: 600 }, reducedMotion: 'reduce' });
  const errors = [];
  async function player(name) {
    const page = await context.newPage(); page.setDefaultTimeout(60000);
    page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    await page.goto(origin + '/?pvp=local');
    await page.click('#start-rts'); await page.waitForSelector('#rt-pvp'); await page.click('#rt-pvp'); await page.waitForSelector('.pvp-card');
    await page.click('[data-act="mode:up"]');
    await page.fill('input[name="nick"]', name); await page.fill('input[name="email"]', `${name}@example.dev`); await page.fill('input[name="password"]', 'secret12');
    await page.click('button[type="submit"]'); await page.waitForSelector('[data-act="quick"]');
    return page;
  }
  const a = await player('Alpha'), b = await player('Beta');
  await a.click('[data-act="quick"]'); await a.waitForSelector('.pvp-wait');
  await b.click('[data-act="quick"]');
  for (const p of [a, b]) await p.waitForFunction(() => document.querySelector('.rt-root')?.dataset.phase === 'play' && window.__rts?.sim, null, { timeout: 60000 });
  for (const p of [a, b]) await p.evaluate(() => { window.__rtsBoost = 12; }); // 헤드리스 SwiftShader 는 화면이 느려 시뮬레이션을 앞당깁니다
  const me = p => p.evaluate(() => window.__rts.me());
  assert.deepEqual([await me(a), await me(b)].sort(), [0, 1], 'one host (0) and one guest (1)');
  // A 는 일꾼을 뽑고 보급소를 짓고, B 는 병영을 짓고 일꾼 하나를 움직입니다.
  const act = (p, plan) => p.evaluate(plan);
  await act(a, () => { const r = window.__rts, s = r.sim, m = r.me(); const hq = s.buildings.find(x => x.owner === m && x.kind === 'hq'), w = s.units.filter(u => u.owner === m); r.issue({ k: 'train', b: hq.id, u: 'worker' }); r.issue({ k: 'train', b: hq.id, u: 'worker' }); const d = m === 0 ? 1 : -1; r.issue({ k: 'build', id: w[0].id, b: 'depot', x: hq.x + 6 * d, y: hq.y - 5 * d }); });
  await act(b, () => { const r = window.__rts, s = r.sim, m = r.me(); const hq = s.buildings.find(x => x.owner === m && x.kind === 'hq'), w = s.units.filter(u => u.owner === m); const d = m === 0 ? 1 : -1; r.issue({ k: 'build', id: w[1].id, b: 'barracks', x: hq.x + 8 * d - (d < 0 ? 2 : 0), y: hq.y - 3 * d }); r.issue({ k: 'move', ids: [w[2].id], x: hq.x + 9 * d, y: hq.y - 9 * d }); });
  await sleep(14000);
  const tickOf = p => p.evaluate(() => window.__rts.sim.tick);
  const ta = await tickOf(a), tb = await tickOf(b);
  assert.ok(ta > 100 && tb > 100, `both simulations advance (A ${ta}, B ${tb})`);
  assert.ok(Math.abs(ta - tb) <= 40, `ticks stay in step (A ${ta}, B ${tb})`);
  const logs = await Promise.all([a, b].map(p => p.evaluate(() => window.__rtsLog ?? [])));
  const mapB = new Map(logs[1]); let common = 0;
  for (const [t, h] of logs[0]) if (mapB.has(t)) { common++; assert.equal(mapB.get(t), h, `state hash differs at tick ${t}`); }
  assert.ok(common >= 5, `compared ${common} common ticks`);
  const built = await Promise.all([a, b].map(p => p.evaluate(() => window.__rts.sim.buildings.map(x => `${x.owner}:${x.kind}`).sort().join(','))));
  assert.match(built[0], /0:depot|1:depot/); assert.equal(built[0].includes('barracks'), true); assert.equal(built[0].split(',').length, built[1].split(',').length, 'same buildings on both sides');
  await a.screenshot({ path: 'browser-artifacts/rts-pvp-a.png' }); await b.screenshot({ path: 'browser-artifacts/rts-pvp-b.png' });
  // 항복: 보낸 쪽은 패배, 상대는 승리 카드.
  const loser = (await me(a)) === 0 ? a : b, winner = loser === a ? b : a;
  await loser.evaluate(() => window.__rts.issue({ k: 'surrender' }));
  await winner.waitForSelector('.rt-result.win', { timeout: 30000 }); await loser.waitForSelector('.rt-result.lose', { timeout: 30000 });
  await winner.waitForFunction(() => /레이팅 \+/.test(document.querySelector('.rt-result')?.textContent ?? ''), null, { timeout: 40000 });
  await winner.screenshot({ path: 'browser-artifacts/rts-pvp-result.png' });
  assert.deepEqual(errors, [], errors.join('\n'));
  console.log('rts pvp smoke ok: ticks', ta, tb, 'compared', common);
} finally { await browser?.close(); server.kill(); }
