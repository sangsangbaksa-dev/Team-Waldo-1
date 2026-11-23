import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

// HUSTLE 스모크: 허브 → 새로 시작 → 걷기 → 장소 상호작용(E) → 빈 병 줍기·팔기 → 현황·지도·메뉴 → 나가기. 개발 서버의 __ty 훅을 씁니다.
const port = 4197, origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: process.cwd(), stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) break; } catch { /* 서버 대기 */ } await sleep(250); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  for (const size of [{ name: 'desktop', width: 1180, height: 700, touch: false }, { name: 'mobile', width: 390, height: 780, touch: true }]) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: size.touch, isMobile: size.touch });
    await context.addInitScript(() => { localStorage.setItem('waldo.preferences.v1', JSON.stringify({ sound: false, quality: 'low', reducedMotion: true })); });
    const page = await context.newPage(); page.setDefaultTimeout(60000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin + '/');
    assert.match(await page.textContent('#start-tycoon'), /HUSTLE/, 'The hub lists HUSTLE');
    await page.click('#start-tycoon'); await page.waitForFunction(() => window.__ty?.phase === 'title');
    await page.click('[data-title="new"]'); await page.waitForFunction(() => window.__ty.phase === 'play');
    assert.equal(await page.locator('#ty-hud').isVisible(), true, 'HUD visible');
    // Currency labels vary by locale/design ('0', '$0', '₩0'); verify amount.
    const cash = async () => Number((await page.locator('#ty-cash').textContent() || '').replace(/[^0-9-]/g, ''));
    assert.equal(await cash(), 0, 'Starts broke');
    // 걷기
    const p0 = await page.evaluate(() => ({ x: window.__ty.player.pos.x, z: window.__ty.player.pos.z }));
    // Use real Playwright keydown/keyup rather than synthetic untrusted events
    // so this exercises the same focus/input pathway as players.
    await page.keyboard.down('w'); await sleep(1200); await page.keyboard.up('w');
    const p1 = await page.evaluate(() => ({ x: window.__ty.player.pos.x, z: window.__ty.player.pos.z }));
    const movement = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    const movementState = await page.evaluate(() => ({
      phase: window.__ty.phase,
      modalVisible: !!document.querySelector('.ty-modal:not([hidden])'),
      pointerLocked: document.pointerLockElement !== null,
      playerSpeed: window.__ty.player.speed,
    }));
    assert.ok(movement > 0.5, 'Pressing W walks the player: ' + JSON.stringify({ p0, p1, movement, movementState }));
    // 쓰레기 골목에서 병 줍기 → 고물상에서 팔기
    const go = id => page.evaluate(id => { const t = window.__ty, d = t.city.doorOf(id); t.player.teleport(d.x + d.fx * 1.5, d.z + d.fz * 1.5, 0); }, id);
    await go('alley'); await page.waitForSelector('#ty-prompt:not([hidden])');
    await page.keyboard.press('KeyE'); await page.waitForSelector('.ty-act:not([disabled])');
    await page.click('.ty-act[data-act="collect"]'); await page.waitForFunction(() => !document.querySelector('#ty-activity')?.hidden === false || document.querySelector('#ty-carry')?.textContent.includes('빈 병'), null, { timeout: 20000 });
    await page.waitForFunction(() => document.querySelector('#ty-carry')?.textContent.includes('빈 병'));
    await go('junkyard'); await page.waitForSelector('#ty-prompt:not([hidden])'); await page.keyboard.press('KeyE');
    await page.click('.ty-act[data-act="sell_bottles"]'); await page.waitForFunction(() => {
      const label = document.querySelector('#ty-cash')?.textContent || '';
      return Number(label.replace(/[^0-9-]/g, '')) > 0;
    });
    // 현황·지도·메뉴
    await page.keyboard.press('Escape'); await page.waitForSelector('.ty-modal', { state: 'hidden' });
    await page.keyboard.press('Tab'); await page.waitForSelector('.ty-panel[aria-label="현황"]'); await page.keyboard.press('Escape'); await page.waitForSelector('.ty-modal', { state: 'hidden' });
    await page.keyboard.press('KeyM'); await page.waitForSelector('#ty-bigmap'); await page.keyboard.press('Escape');
    await page.keyboard.press('Escape'); await page.waitForSelector('.ty-panel[aria-label="일시정지"]'); await page.click('[data-menu="save"]');
    assert.ok(await page.evaluate(() => !!localStorage.getItem('waldo.tycoon.v1')), 'Save is written');
    // 처음부터 다시 시작: 한 번 누르면 확인만 받고, 두 번째에 저장이 지워지고 첫날로 돌아간다.
    await page.click('[data-menu="restart"]'); assert.ok(await page.evaluate(() => window.__ty.core.state.cash > 0), 'The first press only asks for confirmation');
    await page.click('[data-menu="restart"]'); await page.waitForSelector('.ty-modal', { state: 'hidden' });
    assert.equal(await cash(), 0, 'Restart brings back the broke start');
    assert.equal(await page.evaluate(() => window.__ty.core.state.day), 1, 'Restart returns to day 1');
    await page.keyboard.press('Escape'); await page.waitForSelector('.ty-panel[aria-label="일시정지"]');
    await page.click('[data-menu="exit"]'); await page.waitForSelector('#start-tycoon');
    assert.match(await page.textContent('#start-tycoon .tile-status'), /일차/, 'The hub shows the saved stage and day');
    assert.deepEqual(errors, [], `No page errors (${size.name})`);
    await context.close();
    console.log(`tycoon smoke ${size.name}: ok`);
  }
  // WebGL 이 없으면 허브로 조용히 튕기지 않고 안내 화면을 보여 준다.
  const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });
  await ctx.addInitScript(() => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : get.call(this, t, ...a); }; });
  const bare = await ctx.newPage(); await bare.goto(origin + '/'); await bare.click('#start-tycoon');
  await bare.waitForSelector('.ty-title:not([hidden]) [data-title="exit"]'); assert.match(await bare.textContent('.ty-title h1'), /그래픽/, 'Without WebGL the failure screen is shown');
  await bare.click('[data-title="exit"]'); await bare.waitForSelector('#start-tycoon'); console.log('tycoon smoke no-webgl: ok'); await ctx.close();
} finally { await browser?.close(); server.kill(); }
