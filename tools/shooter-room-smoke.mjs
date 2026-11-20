import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

// ZERO ZONE 멀티플레이 방: 세 탭이 `?pvp=local` 백엔드로 3인 방에 모여 서바이벌을 시작하고, 서로의 위치가 보이며, 두 명이 쓰러지면 남은 한 명이 우승하는지 확인합니다.
const port = 4193, origin = 'http://127.0.0.1:' + port;
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

  const player = async name => {
    const page = await open(name);
    await page.click('[data-mode="room"]'); await page.click('[data-fill="0"]'); await page.click('[data-act="start"]'); await page.waitForSelector('.pvp-card');
    await page.click('[data-act="mode:up"]');
    await page.fill('input[name="nick"]', name); await page.fill('input[name="email"]', `${name}@example.dev`); await page.fill('input[name="password"]', 'secret12');
    await page.click('button[type="submit"]'); await page.waitForSelector('[data-act="newroom"]');
    return page;
  };
  const [a, b, c] = [await player("Alpha"), await player("Beta"), await player("Gamma")];
  await a.click('[data-act="newroom"]'); await a.waitForSelector('select[name="max"]'); await a.selectOption('select[name="max"]', '3'); await a.click('button[type="submit"]');
  await a.waitForSelector("#pvp-code"); const code = (await a.locator('#pvp-code').innerText()).trim();
  await b.waitForSelector('[data-act^="enter:"]'); await b.click('[data-act^="enter:"]'); await b.waitForSelector('.pvp-members');
  await c.fill('input[name="code"]', code.toLowerCase()); await c.click('button:has-text("코드로 입장")'); await c.waitForSelector('.pvp-members');
  for (const [n, p] of [["b", b], ["c", c]]) { await p.waitForSelector('[data-act="ready"]', { timeout: 8000 }).catch(async () => console.log(n, (await p.locator(".pvp-root").innerText()).replace(/\n+/g, " | "))); await p.click('[data-act="ready"]'); }
  await a.waitForSelector('.pvp-root [data-act="start"]:not([disabled])'); await a.click('.pvp-root [data-act="start"]');
  for (const p of [a, b, c]) await p.waitForFunction(() => window.__zz?.phase === 'countdown' || window.__zz?.phase === 'play', null, { timeout: 60000 });
  for (const p of [a, b, c]) await p.evaluate(() => window.__zz.go());
  for (const p of [a, b, c]) await p.waitForFunction(() => window.__zz.phase === 'play');
  const names = await b.evaluate(() => window.__zz.match.players.map(x => x.name));
  assert.deepEqual(names, ['Alpha', 'Beta', 'Gamma']);
  // 채팅: A 가 Enter 로 입력창을 열어 보내면 B·C 의 채팅 로그에 닉네임과 함께 나타납니다.
  await a.keyboard.press('Enter'); await a.waitForSelector('.sz-chatin', { state: 'visible' });
  await a.keyboard.type('hello <b>team</b>'); await a.keyboard.press('Enter');
  for (const p of [b, c]) await p.waitForFunction(() => /Alpha\s+hello <b>team<\/b>/.test(document.querySelector('.sz-chatlog')?.textContent ?? ''), null, { timeout: 15000 });
  assert.equal(await b.locator('.sz-chatlog b').count(), 1, 'chat text must not be parsed as HTML');
  // 내 위치를 옮기면 다른 탭에서 그 선수가 따라옵니다.
  await a.evaluate(() => { const m = window.__zz.me(); m.x += 6; });
  const ax = await a.evaluate(() => window.__zz.me().x);
  await b.waitForFunction(x => Math.abs(window.__zz.match.players[0].x - x) < 3, ax, { timeout: 30000 });
  await a.screenshot({ path: 'browser-artifacts/shooter-room-a.png' });
  // B, C 가 차례로 쓰러지면 A 가 우승합니다.
  // 백그라운드 탭은 프레임이 멈추므로 탭을 앞으로 가져오며 진행시킵니다.
  for (const p of [b, c]) { await p.bringToFront(); await p.evaluate(() => { const g = window.__zz.match, m = window.__zz.me(); g.kill(m, 0, 'rifle'); }); await sleep(1500); }
  await a.bringToFront(); await a.waitForSelector('.sz-card h2:text-matches("최후의 1인")', { timeout: 60000 });
  await a.screenshot({ path: 'browser-artifacts/shooter-room-result-a.png' });
  console.log((await Promise.all([a, b, c].map(p => p.locator('.sz-card').innerText().catch(() => '')))).map(t => t.replace(/\n+/g, ' | ')).join('\n'));
  assert.deepEqual(errors, []);
  console.log('SHOOTER ROOM SMOKE OK');
} finally { await browser?.close(); server.kill(); }
