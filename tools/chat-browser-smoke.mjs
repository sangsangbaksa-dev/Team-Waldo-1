import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

// 채팅을 실제 브라우저로 확인합니다(`?pvp=local` 백엔드, 같은 브라우저의 탭끼리):
// ① 허브 전체 채팅(로그인 안 한 탭은 읽기만), ② SPEED RUSH 방 채팅(로비 탭), ③ 게임 중 Enter 채팅, ④ 모바일 화면.
// 실행: node tools/chat-browser-smoke.mjs  (클라우드 컨테이너에서는 CHROMIUM_PATH=/opt/pw-browsers/chromium)
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
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const errors = [];
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const open = async (ctx, name) => { const p = await ctx.newPage(); p.setDefaultTimeout(30000); p.on('pageerror', e => errors.push(`${name}: ${e.message}`)); await p.goto(origin + '/?pvp=local'); return p; };
  async function signUp(page, name) {
    await page.fill('input[name="nick"]', name); await page.fill('input[name="email"]', `${name}@example.dev`); await page.fill('input[name="password"]', 'secret12');
    await page.click('.pvp-card button[type="submit"]');
  }
  async function say(page, text) { await page.fill('.chat-form input[name="chat"]', text); await page.press('.chat-form input[name="chat"]', 'Enter'); }

  // ① 허브: 로그인 안 한 탭 B 는 읽기만, A 는 채팅 창에서 로그인하고 보냅니다.
  const a = await open(desktop, 'A'), guest = await open(desktop, 'guest');
  await a.waitForSelector('.chat-toggle'); await a.click('.chat-toggle');
  await a.click('[data-chat="login"]'); await a.waitForSelector('.pvp-card'); await a.click('[data-act="mode:up"]'); await signUp(a, 'Alpha');
  await a.waitForSelector('.pvp-me'); await a.click('.pvp-x');
  await a.waitForSelector('.chat-form'); await say(a, '안녕하세요   씨 발 다들');
  await a.waitForFunction(() => document.querySelector('.chat-list')?.textContent?.includes('안녕하세요 *** 다들'));
  await guest.waitForSelector('.chat-toggle'); await guest.waitForSelector('.chat-feed li'); // 접힌 창에도 새 글이 잠깐 보입니다
  await guest.click('.chat-toggle'); assert.ok(await guest.locator('[data-chat="login"]').isVisible(), 'guest sees login button');
  assert.match(await guest.locator('.chat-list').innerText(), /안녕하세요 \*\*\* 다들/);
  await say(a, '두 번째'); await a.waitForFunction(() => /천천히/.test(document.querySelector('.chat-note')?.textContent ?? '') || document.querySelector('.chat-list')?.textContent?.includes('두 번째'));
  await a.screenshot({ path: 'browser-artifacts/chat-hub-desktop.png' });
  console.log('HUB OK');

  await a.click('.chat-x'); await a.waitForSelector('.chat-panel', { state: 'detached' });
  // ② SPEED RUSH 2인 방: 로비 채팅 탭(방·게임 로비·전체), ③ 게임 중 Enter 채팅
  const b = await open(desktop, 'B');
  for (const [p, name, up] of [[a, 'Alpha', false], [b, 'Beta', true]]) {
    await p.click('#start-race'); await p.waitForSelector('.rc-setup'); await p.click('[data-pick="laps:1"]'); await p.click('[data-setup="pvp"]'); await p.waitForSelector('.pvp-card');
    if (up) { await p.click('[data-act="mode:up"]'); await signUp(p, name); }
    await p.waitForSelector('[data-act="newroom"]');
  }
  assert.equal(await a.locator('.chat-dock').getAttribute('data-mode'), 'lobby');
  await a.click('[data-act="newroom"]'); await a.click('.pvp-card button[type="submit"]'); await a.waitForSelector('#pvp-code');
  const code = (await a.locator('#pvp-code').innerText()).trim();
  await b.fill('input[name="code"]', code); await b.click('button:has-text("코드로 입장")'); await b.waitForSelector('.pvp-members');
  await b.click('.chat-toggle'); await b.waitForSelector('.chat-tabs');
  assert.deepEqual(await b.locator('.chat-tabs [role="tab"]').allInnerTexts(), ['방', 'SPEED RUSH 로비', '전체']);
  await say(b, '준비됐어요');
  await a.waitForSelector('.chat-toggle .chat-badge'); await a.click('.chat-toggle');
  await a.waitForFunction(() => document.querySelector('.chat-list')?.textContent?.includes('준비됐어요'));
  await a.screenshot({ path: 'browser-artifacts/chat-room-lobby.png' });
  await b.click('[data-act="ready"]'); await a.waitForSelector('[data-act="start"]:not([disabled])'); await a.click('[data-act="start"]');
  for (const p of [a, b]) await p.waitForSelector('.rc-root[data-phase="countdown"], .rc-root[data-phase="racing"]');
  for (const p of [a, b]) await p.waitForSelector('.chat-dock[data-mode="game"]');
  await a.locator('canvas').first().click({ position: { x: 640, y: 400 } }).catch(() => undefined);
  await a.keyboard.press('Enter'); await a.waitForSelector('.chat-form input:focus');
  await a.keyboard.type('wasd 좋은 게임!'); await a.screenshot({ path: 'browser-artifacts/chat-ingame-open.png' }); await a.keyboard.press('Enter');
  await a.waitForFunction(() => !document.querySelector('.chat-panel'));
  await b.waitForFunction(() => document.querySelector('.chat-feed')?.textContent?.includes('wasd 좋은 게임!'));
  await b.screenshot({ path: 'browser-artifacts/chat-ingame-desktop.png' });
  // 휴대폰 가로·세로 크기에서 게임 중 채팅 위치
  for (const [w, h, name] of [[844, 390, 'landscape'], [390, 844, 'portrait']]) {
    await b.setViewportSize({ width: w, height: h }); await sleep(300); await b.screenshot({ path: `browser-artifacts/chat-ingame-${name}.png` });
    await b.click('.chat-toggle'); await b.waitForSelector('.chat-panel');
    const r = await b.locator('.chat-panel').boundingBox(); assert.ok(r && r.y >= 0 && r.y + r.height <= h + 1 && r.x + r.width <= w, `in-game panel fits ${name}`);
    await b.screenshot({ path: `browser-artifacts/chat-ingame-${name}-open.png` }); await b.click('.chat-x');
  }
  console.log('ROOM + IN-GAME OK');
  await Promise.all([a, b, guest].map(p => p.close()));

  // ④ 모바일: 허브와 게임 중
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const m = await open(phone, 'mobile'); await m.waitForSelector('.chat-toggle'); await m.screenshot({ path: 'browser-artifacts/chat-hub-mobile-closed.png' });
  await m.click('.chat-toggle'); await m.waitForSelector('.chat-panel'); await m.screenshot({ path: 'browser-artifacts/chat-hub-mobile-open.png' });
  const box = await m.locator('.chat-panel').boundingBox(); assert.ok(box && box.x >= 0 && box.x + box.width <= 390, 'panel fits phone width');
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth); assert.equal(overflow, false, 'no horizontal scroll');
  console.log('MOBILE OK');

  assert.deepEqual(errors, [], 'page errors: ' + errors.join('\n'));
  console.log('CHAT SMOKE OK');
} finally {
  await browser?.close(); server.kill();
}
