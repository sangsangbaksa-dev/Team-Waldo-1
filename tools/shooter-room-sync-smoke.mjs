import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

// ZERO ZONE 멀티플레이 방 + AI 채우기: 세 탭이 `?pvp=local` 백엔드로 3인 방(AI 30명)에 모입니다.
// 방장이 계산하는 AI 가 손님 화면에서도 같은 자리에 있고, 폭격 구역이 같고, 손님이 차를 타고 몰면 방장 화면에서도 그 차가 움직이는지 확인합니다.
const port = 4194, origin = 'http://127.0.0.1:' + port, out = process.env.SHOTS_DIR || 'browser-artifacts';
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
  const a = await player('Alpha', 30), b = await player('Beta'), c = await player('Gamma');
  await a.click('[data-act="newroom"]'); await a.waitForSelector('select[name="max"]'); await a.selectOption('select[name="max"]', '3'); await a.click('button[type="submit"]');
  await a.waitForSelector('#pvp-code'); const code = (await a.locator('#pvp-code').innerText()).trim();
  for (const p of [b, c]) { await p.fill('input[name="code"]', code.toLowerCase()); await p.click('button:has-text("코드로 입장")'); await p.waitForSelector('.pvp-members'); await p.waitForSelector('[data-act="ready"]'); await p.click('[data-act="ready"]'); }
  await a.waitForSelector('.pvp-root [data-act="start"]:not([disabled])'); await a.click('.pvp-root [data-act="start"]');
  for (const p of [a, b, c]) await p.waitForFunction(() => window.__zz?.phase === 'countdown' || window.__zz?.phase === 'play', null, { timeout: 60000 });
  for (const p of [a, b, c]) await p.evaluate(() => window.__zz.go());
  for (const p of [a, b, c]) { await p.bringToFront(); await p.waitForFunction(() => window.__zz.phase === 'play'); }
  const info = await Promise.all([a, b, c].map(p => p.evaluate(() => { const m = window.__zz.match; return { n: m.players.length, auth: m.authority, me: window.__zz.me().name, names: m.players.map(x => x.name).join(','), reds: m.reds.map(r => `${r.x.toFixed(1)},${r.z.toFixed(1)}`).join(' '), veh: m.vehicles.length }; })));
  console.log(info.map(i => `${i.me}: ${i.n} players [${i.names.split(',').slice(0, 4)}], authority=${i.auth}, vehicles=${i.veh}`).join('\n'));
  assert.equal(info[0].n, 30); assert.deepEqual(info.map(i => i.auth), [true, false, false]);
  assert.ok(info.every(i => i.names === info[0].names && i.reds === info[0].reds && i.veh === info[0].veh && i.veh > 10));

  // 셋 다 비행기에서 뛰어내려 땅에 내려놓습니다(시험용). AI 는 방장 쪽에서 스스로 강하합니다.
  const land = (p, dx) => p.evaluate(dx => { const m = window.__zz.match, me = window.__zz.me(), v = m.vehicles.find(x => !x.wreck); me.air = 0; me.alt = 0; me.x = v.x + 3.2 + dx; me.z = v.z; me.landedAt = m.t; return v.id; }, dx);
  const vid = await land(b, 0); await land(a, 6); await land(c, 9);
  // AI 가 착지할 때까지 진행(방장은 백그라운드에서도 계산을 이어 갑니다)
  // 시험 환경(소프트웨어 렌더링)은 프레임이 느려서 방장 경기를 60초 빨리 돌립니다. 그동안 보낸 상태를 손님이 받습니다.
  await a.evaluate(() => window.__zz.advance(60)); await b.bringToFront(); await sleep(6000);
  const pos = async p => p.evaluate(() => window.__zz.match.players.filter(x => x.bot && x.alive && x.air === 0).map(x => [x.id, x.x, x.z]));
  const ha = await pos(a), hb = await pos(b), byId = new Map(hb.map(([i, x, z]) => [i, [x, z]]));
  let worst = 0, matched = 0; for (const [i, x, z] of ha) { const o = byId.get(i); if (!o) continue; matched++; worst = Math.max(worst, Math.hypot(o[0] - x, o[1] - z)); }
  console.log(`landed bots on host ${ha.length}, matched on guest ${matched}, worst offset ${worst.toFixed(2)} m`);
  assert.ok(ha.length >= 10 && matched >= ha.length - 2, 'guest sees landed bots');
  assert.ok(worst < 12, 'bot positions agree');
  await b.screenshot({ path: `${out}/room-sync-guest-bots.png` });

  // 손님(Beta)이 차에 탑니다: E 를 누르면 방장이 허락하고, 손님 브라우저가 차를 굴립니다.
  await b.evaluate(vid => { const m = window.__zz.match, me = window.__zz.me(), v = m.vehicles[vid]; me.x = v.x + 3.2; me.z = v.z; me.yaw = v.yaw; }, vid);
  // 프레임이 느린 시험 환경이라 E 를 잠깐 누르고 있습니다.
  await b.keyboard.down('KeyE'); await sleep(1500); await b.keyboard.up('KeyE');
  await b.waitForFunction(() => window.__zz.me().veh >= 0, null, { timeout: 20000 });
  const bv = await b.evaluate(() => window.__zz.me().veh);
  await b.keyboard.down('KeyW'); await sleep(8000); await b.keyboard.up('KeyW');
  const vb = await b.evaluate(id => { const v = window.__zz.match.vehicles[id]; return [v.x, v.z, v.speed, v.remote]; }, bv);
  await sleep(600);
  const va = await a.evaluate(id => { const m = window.__zz.match, v = m.vehicles[id]; return [v.x, v.z, v.driver, m.players[1].veh, v.remote]; }, bv);
  const vc = await c.evaluate(id => { const m = window.__zz.match, v = m.vehicles[id]; return [v.x, v.z, v.driver]; }, bv);
  console.log('guest drives vehicle', bv, 'guest', vb.map(v => typeof v === 'number' ? v.toFixed(1) : v).join(','), '| host', va.map(v => typeof v === 'number' ? v.toFixed(1) : v).join(','), '| third', vc.map(v => v.toFixed(1)).join(','));
  assert.equal(vb[3], false, 'guest simulates its own vehicle'); assert.equal(va[2], 1); assert.equal(va[3], bv); assert.equal(vc[2], 1);
  assert.ok(Math.hypot(va[0] - vb[0], va[1] - vb[1]) < 8 && Math.hypot(vc[0] - vb[0], vc[1] - vb[1]) < 8, 'other screens follow the guest car');
  await b.screenshot({ path: `${out}/room-sync-guest-driving.png` });
  await a.bringToFront(); await a.evaluate(id => { const m = window.__zz.match, v = m.vehicles[id], me = window.__zz.me(); me.x = v.x - 10; me.z = v.z - 4; window.__zz.look(Math.atan2(v.z - me.z, v.x - me.x), -0.05); }, bv); await sleep(900);
  await a.screenshot({ path: `${out}/room-sync-host-sees-car.png` });
  // 내리면 남은 움직임은 방장이 넘겨받습니다.
  await b.bringToFront(); await b.keyboard.down('KeyE'); await sleep(1500); await b.keyboard.up('KeyE'); await b.waitForFunction(() => window.__zz.me().veh < 0); await sleep(1200);
  const after = await a.evaluate(id => { const v = window.__zz.match.vehicles[id]; return [v.remote, v.driver]; }, bv);
  assert.deepEqual(after, [false, -1], 'host owns the parked car again');

  // 방장이 AI 를 쓰러뜨리면 손님 화면에서도 쓰러집니다.
  const victim = await a.evaluate(() => { const m = window.__zz.match, q = m.players.find(x => x.bot && x.alive && x.air === 0); m.kill(q, 0, 'rifle'); return q.id; });
  await b.waitForFunction(id => !window.__zz.match.players[id].alive, victim, { timeout: 10000 });
  assert.deepEqual(errors, []);
  console.log('SHOOTER ROOM SYNC SMOKE OK');
} finally { await browser?.close(); server.kill(); }
