import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

// 두 브라우저 탭으로 LAST CITY 1대1 결투를 확인합니다(가입 → 매칭 → 서로 보임 → 사격 판정 → 5킬 승부 → 결과·레이팅). `?pvp=local` 개발용 백엔드를 씁니다.
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
  const context = await browser.newContext({ viewport: { width: 640, height: 400 }, reducedMotion: 'reduce' });
  const errors = [];
  async function player(name) {
    const page = await context.newPage(); page.setDefaultTimeout(40000);
    page.on('pageerror', e => { errors.push(`${name}: ${e.message}`); console.log('PAGEERROR', name, e.message); });
    await page.goto(origin + '/?pvp=local');
    await page.click('#start-city'); await page.waitForSelector('.c-setup');
    await page.click('[data-act="duel:warlord"]'); await page.waitForSelector('.pvp-card');
    await page.click('[data-act="mode:up"]');
    await page.fill('input[name="nick"]', name); await page.fill('input[name="email"]', `${name}@example.dev`); await page.fill('input[name="password"]', 'secret12');
    await page.click('button[type="submit"]'); await page.waitForSelector('[data-act="quick"]');
    return page;
  }
  const a = await player('Alpha'), b = await player('Beta');
  await a.click('[data-act="quick"]'); await a.waitForSelector('.pvp-wait');
  await b.click('[data-act="quick"]');
  for (const p of [a, b]) await p.waitForFunction(() => window.__city && !document.querySelector('.city-hud')?.hidden, null, { timeout: 60000 });
  // 서로의 위치가 맞는지: A 가 보는 상대(조직 1) 위치 == B 의 내 위치
  await sleep(2500);
  const pos = p => p.evaluate(() => { const w = window.__city.world, me = w.boss(0), foe = w.boss(1); return { me: [me.x, me.y], foe: [foe.x, foe.y], names: w.factions.slice(0, 2).map(f => f.name), n: w.actors.filter(x => x.alive).length }; });
  const pa = await pos(a), pb = await pos(b);
  assert.ok(Math.hypot(pa.foe[0] - pb.me[0], pa.foe[1] - pb.me[1]) < 30, `A sees B at ${pa.foe}, B is at ${pb.me}`);
  assert.ok(Math.hypot(pb.foe[0] - pa.me[0], pb.foe[1] - pa.me[1]) < 30, `B sees A at ${pb.foe}, A is at ${pa.me}`);
  await a.screenshot({ path: 'browser-artifacts/duel-a.png' });
  // 병력·건설 동기화: A 가 병영을 짓고 병력을 뽑으면 B 의 세계에 꼭두각시 건물·병력이 나타난다
  await a.evaluate(() => { const w = window.__city.world, f = w.factions[0], hq = w.hq(0); f.cash = 9999; f.crystal = 9999; window.__buildErr = 'x'; for (const [dx, dy] of [[170, 0], [-170, 0], [0, 170], [0, -170], [170, 170], [-170, -170], [170, -170], [-170, 170], [230, 0], [-230, 0]]) { window.__buildErr = w.build(0, 'barracks', hq.x + 60 + dx, hq.y + 60 + dy); if (!window.__buildErr) break; } w.train(0, 'worker'); });
  assert.equal(await a.evaluate(() => window.__buildErr), '', 'A should be able to build in a duel');
  // 헤드리스(SwiftShader)는 프레임이 아주 느리니 건설 시간을 기다리지 않고 완공 상태로 만듭니다(동기화만 확인)
  await a.evaluate(() => { const b = window.__city.world.structures.find(s => s.f === 0 && s.kind === 'barracks'); b.built = 1; b.hp = b.maxHp; });
  await b.waitForFunction(() => { const w = window.__city.world; return w.structures.some(s => s.f === 1 && s.kind === 'barracks' && s.built >= 1) && w.actors.filter(x => x.alive && x.f === 1 && x.kind !== 'boss').length >= 6; }, null, { timeout: 90000, polling: 500 });
  await a.waitForFunction(() => { const w = window.__city.world; return w.structures.some(s => s.f === 0 && s.kind === 'barracks' && s.built >= 1); }, null, { timeout: 90000, polling: 500 });
  const armyA = await a.evaluate(() => window.__city.world.actors.filter(x => x.alive && x.f === 0 && x.kind !== 'boss').length);
  const armyB = await b.evaluate(() => window.__city.world.actors.filter(x => x.alive && x.f === 1 && x.kind !== 'boss').length);
  assert.ok(Math.abs(armyA - armyB) <= 2, `B sees ${armyB} of A's ${armyA} units`);
  await b.screenshot({ path: 'browser-artifacts/duel-army-b.png' });
  // 사격 판정: A 가 B 바로 옆(왼쪽 70)에서 B 쪽으로 쏘면 B 쪽 세계에서 B 의 보스가 맞는다
  // 판정은 맞은 횟수로 봅니다(체력은 자동 회복으로 다시 차오를 수 있습니다)
  await b.evaluate(() => { const w = window.__city.world; w.boss(0).hp = w.boss(0).maxHp; window.__hits = 0; const h = w.hurtActor.bind(w); w.hurtActor = (t, d, f) => { if (t.kind === 'boss' && t.f === 0 && f === 1) window.__hits++; h(t, d, f); }; });
  const hit = await (async () => {
    for (let k = 0; k < 6; k++) {
      await a.evaluate(() => { const w = window.__city.world, me = w.boss(0), foe = w.boss(1); me.x = foe.x - 70; me.y = foe.y; w.shoot(me.x + 20, me.y, 0, 'pistol', 0, me.id, 1, true); });
      await sleep(900);
    }
    return { hits: await b.evaluate(() => window.__hits) };
  })();
  assert.ok(hit.hits >= 3, `A's shots should reach and hurt B: ${JSON.stringify(hit)}`);
  if (process.env.DUEL_END === 'hq') { // 본부 파괴로 끝내기: B 의 본부를 무너뜨리면 B 가 진다
    await b.evaluate(() => { const w = window.__city.world; w.hurtStruct(w.hq(0), 1e9, 1); });
  } else
  // 5킬 승부: B 를 다섯 번 쓰러뜨린다(부활 대기를 줄이려고 respawnT 를 당김)
  for (let k = 0; k < 5; k++) {
    await b.waitForFunction(() => window.__city.world.boss(0), null, { timeout: 60000 });
    await b.evaluate(() => { const w = window.__city.world; w.hurtActor(w.boss(0), 1e7, 1); w.factions[0].respawnT = 0.05; });
    await sleep(700);
  }
  for (const p of [a, b]) await p.waitForFunction(() => /레이팅 [+-]\d+/.test(document.body.textContent || ''), null, { timeout: 60000 });
  const heads = await Promise.all([a, b].map(p => p.locator('.c-pause h2').innerText()));
  const text = await Promise.all([a, b].map(p => p.locator('.c-pause').innerText()));
  await a.screenshot({ path: 'browser-artifacts/duel-result-a.png' });
  assert.deepEqual(heads, ['승리', '패배'], text.join(' | '));
  assert.ok(text[0].includes('+16') && text[1].includes('-16'), text.join(' | '));
  assert.deepEqual(errors, []);
  console.log('DUEL SMOKE OK', pa.n, heads);
} finally { await browser?.close(); server.kill(); }
