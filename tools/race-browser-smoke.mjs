// SPEED RUSH browser smoke: launch -> countdown -> recovery -> pause -> time trial finish.
// Run: node tools/race-browser-smoke.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const port = 5198, origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
for (const stream of [server.stdout, server.stderr]) stream.on('data', data => { serverLog += data.toString(); });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
try {
  let online = false;
  for (let i = 0; i < 120 && server.exitCode === null; i++) {
    try { if ((await fetch(origin)).ok) { online = true; break; } } catch { /* boot */ }
    await sleep(250);
  }
  assert.ok(online, 'Vite did not start: ' + serverLog.slice(-3000));
  browser = await chromium.launch({
    headless: true, executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({ viewport: { width: 960, height: 600 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    localStorage.setItem('waldo.race.setup.v1', JSON.stringify({
      map: 'dusk', laps: 1, level: 1, car: 'nova', skin: 'stock', mode: 'trial',
    }));
  });
  await mkdir('browser-artifacts/race', { recursive: true });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await page.locator('#start-race').click();
  await page.locator('.rc-setup').waitFor();
  await page.screenshot({ path: 'browser-artifacts/race/setup.png' });
  await page.locator('[data-pick="mode:race"]').click();
  const instructions = await page.locator('[data-note="mode"]').innerText();
  assert.ok(instructions.includes('브레이크') && instructions.includes('부스트 패드'), instructions);
  assert.ok(!instructions.includes('E 키') && !instructions.includes('오일'), instructions);
  await page.locator('[data-pick="mode:trial"]').click();
  await page.locator('[data-setup="start"]').click();
  await page.waitForFunction(() => document.querySelector('.rc-root')?.dataset.phase === 'countdown');

  // Advance the countdown without waiting for the headless software renderer.
  await page.evaluate(() => { window.__race.skip(3.3); });
  await page.waitForFunction(() => window.__race?.race?.phase === 'racing');
  assert.match(await page.locator('.rc-keys').innerText(), /브레이크/, 'keyboard guide should show the brake key');

  // A recovery must clear the old steering/slip even when invoked mid-race.
  await page.evaluate(() => {
    const c = window.__race.race.player.car;
    c.vf = 30; c.vx = 30; c.steer = 0.8; c.slip = 0.4; c.lat = 8; c.drifting = true;
  });
  await page.keyboard.press('r');
  const recovered = await page.evaluate(() => {
    const c = window.__race.race.player.car;
    return { vx: c.vx, vf: c.vf, steer: c.steer, slip: c.slip, lat: c.lat, drifting: c.drifting };
  });
  assert.deepEqual(recovered, { vx: 0, vf: 0, steer: 0, slip: 0, lat: 0, drifting: false });
  // Repeated R keydowns from a long key hold must not reset vehicle movement.
  await page.evaluate(() => {
    const c = window.__race.race.player.car;
    c.vf = c.vx = 21;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', code: 'KeyR', repeat: true, bubbles: true }));
    if (c.vf !== 21) throw new Error('Repeat recovery teleported car');
    c.vf = c.vx = 0;
    const root = document.querySelector('.rc-root');
    const input = document.createElement('input');
    root.append(input); input.focus();
    const mute = root.querySelector('[data-act="mute"]');
    const original = mute.getAttribute('aria-pressed');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', code: 'KeyM', bubbles: true }));
    if (mute.getAttribute('aria-pressed') !== original) throw new Error('Typing triggered mute');
    input.remove();
  });

  await page.keyboard.press('Escape');
  await page.locator('.rc-modal.show [data-act="resume"]').waitFor();
  await page.locator('.rc-modal.show [data-act="resume"]').click();
  await page.waitForFunction(() => !document.querySelector('.rc-modal')?.classList.contains('show'));
  await page.screenshot({ path: 'browser-artifacts/race/racing.png' });

  // Autopilot is a local development/debug-only input used to reach the finish.
  const completion = await page.evaluate(() => {
    window.__race.dbg.auto = true;
    for (let i = 0; i < 8 && window.__race.race.phase !== 'done'; i++) window.__race.skip(25);
    const r = window.__race.race;
    return { phase: r.phase, time: r.player.finishTime, laps: r.player.lapTimes.length };
  });
  assert.equal(completion.phase, 'done', JSON.stringify(completion));
  assert.ok(completion.time > 0 && completion.laps === 1, JSON.stringify(completion));
  await page.locator('.rc-card.result').waitFor({ timeout: 15_000 });
  await page.screenshot({ path: 'browser-artifacts/race/result.png' });
  const result = await page.evaluate(() => ({
    headline: document.querySelector('.rc-card.result h2')?.textContent,
    stored: localStorage.getItem('waldo.race.ghost.v1:dusk:1:nova'),
  }));
  assert.ok(result.headline?.includes('NEW GHOST'), JSON.stringify(result));
  assert.ok(result.stored, 'Time-trial ghost was not persisted');
  assert.ok(JSON.parse(result.stored).data.length > 8, 'Ghost data is empty');
  // Rebuilding the GL scene must preserve saved ghosts and not leak stale callbacks.
  await page.locator('.rc-card.result [data-act="restart"]').click();
  await page.waitForFunction(() => document.querySelector('.rc-root')?.dataset.phase === 'countdown');
  await page.evaluate(() => window.__race.skip(3.3));
  await page.waitForFunction(() => window.__race.race.phase === 'racing');
  const replay = await page.evaluate(() => ({
    ghost: window.__race.race.ghost?.time ?? null,
    playerTime: window.__race.race.player.finishTime,
    webgl: !!document.querySelector('.rc-canvas'),
  }));
  assert.ok(replay.webgl && replay.playerTime === null && replay.ghost === completion.time,
    'Restart failed to reset race while preserving ghost: ' + JSON.stringify(replay));
  // A different scenery/weather map must rebuild cleanly after the first race.
  await page.keyboard.press('Escape');
  await page.locator('.rc-modal.show [data-act="setup"]').click();
  await page.locator('.rc-setup [data-pick="map:storm"]').click();
  await page.locator('.rc-setup [data-setup="start"]').click();
  await page.waitForFunction(() => document.querySelector('.rc-root')?.dataset.phase === 'countdown');
  await page.evaluate(() => window.__race.skip(3.3));
  await page.waitForFunction(() => window.__race.race.phase === 'racing');
  assert.equal(await page.evaluate(() => window.__race.race.track.n > 0), true);
  await page.screenshot({ path: 'browser-artifacts/race/storm-racing.png' });
  // Simulate a WebGL context loss, which must show a usable restart path.
  await page.evaluate(() => {
    const canvas = document.querySelector('.rc-canvas');
    window.__raceLostCanvas = canvas;
    canvas.dispatchEvent(new Event('webglcontextlost', { bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(() => document.querySelector('.rc-root')?.dataset.phase === 'error');
  assert.match(await page.locator('.rc-modal.show h2').innerText(), /그래픽 연결/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.rc-root').getAttribute('data-phase'), 'error',
    'Pause shortcut must not dismiss WebGL failure');
  await page.locator('.rc-modal.show [data-act="restart"]').click();
  await page.waitForFunction(() => document.querySelector('.rc-root')?.dataset.phase === 'countdown');
  assert.equal(await page.evaluate(() => document.querySelector('.rc-canvas') !== window.__raceLostCanvas), true,
    'context-loss recovery must replace the old canvas');
  await page.evaluate(() => window.__race.skip(3.3));
  await page.waitForFunction(() => window.__race.race.phase === 'racing');
  await page.screenshot({ path: 'browser-artifacts/race/context-recovered.png' });
  // Exercise the desert military outposts' separate kit disposal and scene rebuild.
  await page.keyboard.press('Escape');
  await page.locator('.rc-modal.show [data-act="setup"]').click();
  await page.locator('.rc-setup [data-pick="map:desert"]').click();
  await page.locator('.rc-setup [data-setup="start"]').click();
  await page.waitForFunction(() => document.querySelector('.rc-root')?.dataset.phase === 'countdown');
  await page.evaluate(() => window.__race.skip(3.3));
  await page.waitForFunction(() => window.__race.race.phase === 'racing');
  await page.screenshot({ path: 'browser-artifacts/race/desert-racing.png' });
  // Navigate to the home screen and enter again, without refreshing the tab.
  await page.locator('.rc-btns [data-act="exit"]').click();
  await page.waitForFunction(() => !document.querySelector('.rc-root'));
  assert.equal(await page.evaluate(() => window.__race), undefined, 'old game held through debug globals');
  await page.locator('#start-race').click();
  await page.locator('.rc-setup').waitFor();
  await page.locator('.rc-setup [data-setup="start"]').click();
  await page.waitForFunction(() => document.querySelector('.rc-root')?.dataset.phase === 'countdown');
  assert.ok(await page.evaluate(() => !!window.__race?.race), 're-entry did not create a new game instance');
  await page.screenshot({ path: 'browser-artifacts/race/re-entered.png' });
  // Avoid rendering two SwiftShader scenes at once on slow CI VMs.
  await context.close();
  // Portrait touch layout uses the same game loop and must remain fully usable.
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  await mobileContext.addInitScript(() => {
    localStorage.setItem('waldo.race.setup.v1', JSON.stringify({
      map: 'dusk', laps: 1, level: 1, car: 'arc', skin: 'stock', mode: 'trial',
    }));
    localStorage.setItem('waldo.preferences.v1', JSON.stringify({ sound: false, quality: 'low', reducedMotion: true }));
  });
  const mobile = await mobileContext.newPage();
  mobile.setDefaultTimeout(60_000);
  const mobileCharacterRequests = [];
  mobile.on('request', req => { if (req.url().includes('/characters.glb')) mobileCharacterRequests.push(req.url()); });
  mobile.on('pageerror', error => errors.push('mobile: ' + error.message));
  await mobile.goto(origin);
  await mobile.locator('#start-race').click();
  await mobile.locator('.rc-setup').waitFor();
  await mobile.screenshot({ path: 'browser-artifacts/race/mobile-setup.png' });
  await mobile.locator('[data-setup="start"]').click();
  await mobile.waitForFunction(() => document.querySelector('.rc-root')?.dataset.phase === 'countdown');
  await mobile.evaluate(() => { window.__race.skip(3.3); });
  await mobile.waitForFunction(() => window.__race?.race?.phase === 'racing');
  assert.deepEqual(mobileCharacterRequests, [], 'Low-quality racing should not download optional crowd models');
  const mobileControls = await mobile.evaluate(() => {
    const buttons = [...document.querySelectorAll('.rc-touchpad button')];
    return buttons.map(b => {
      const r = b.getBoundingClientRect();
      return { label: b.textContent, x: r.left, right: r.right, y: r.top, bottom: r.bottom, visible: r.width > 0 && r.height > 0 };
    });
  });
  assert.equal(mobileControls.length, 6, 'expected steering and pedals on mobile');
  assert.ok(mobileControls.every(b => b.visible && b.x >= -1 && b.right <= 391 && b.y >= -1 && b.bottom <= 845), JSON.stringify(mobileControls));
  const mobileHud = await mobile.evaluate(() => {
    const get = selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    return { lap: get('.rc-tl'), timer: get('.rc-tc'), minimap: get('.rc-tr'), speed: get('.rc-bottom') };
  });
  const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  for (const key of ['lap', 'minimap', 'speed']) {
    assert.ok(!intersects(mobileHud.timer, mobileHud[key]), 'portrait timer overlaps ' + key + ': ' + JSON.stringify(mobileHud));
  }
  const motion = await mobile.evaluate(() => ({
    enabled: document.querySelector('.rc-root').classList.contains('reduced-motion'),
    wrongAnimation: getComputedStyle(document.querySelector('.rc-wrong')).animationName,
  }));
  assert.equal(motion.enabled, true);
  assert.equal(motion.wrongAnimation, 'none');
  await mobile.screenshot({ path: 'browser-artifacts/race/mobile-racing.png' });
  // Landscape has a separate CSS layout for the pedals.
  await mobile.setViewportSize({ width: 844, height: 390 });
  const landscapeControls = await mobile.evaluate(() => [...document.querySelectorAll('.rc-touchpad button')].map(b => {
    const r = b.getBoundingClientRect();
    return { x: r.left, right: r.right, y: r.top, bottom: r.bottom };
  }));
  assert.ok(landscapeControls.every(b => b.x >= -1 && b.right <= 845 && b.y >= -1 && b.bottom <= 391), JSON.stringify(landscapeControls));
  await mobile.screenshot({ path: 'browser-artifacts/race/mobile-landscape.png' });
  // Small phones need safe inset margins even when all touch buttons are visible.
  await mobile.setViewportSize({ width: 320, height: 568 });
  const smallControls = await mobile.evaluate(() => [...document.querySelectorAll('.rc-touchpad button')].map(b => {
    const r = b.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  }));
  assert.ok(smallControls.every(b => b.left >= 7 && b.right <= 313 && b.top >= 0 && b.bottom <= 569),
    '320px touch targets must respect edge margins: ' + JSON.stringify(smallControls));
  await mobile.screenshot({ path: 'browser-artifacts/race/mobile-small.png' });
  const mobileCompletion = await mobile.evaluate(() => {
    window.__race.dbg.auto = true;
    for (let i = 0; i < 8 && window.__race.race.phase !== 'done'; i++) window.__race.skip(25);
    return { phase: window.__race.race.phase, time: window.__race.race.player.finishTime };
  });
  assert.equal(mobileCompletion.phase, 'done', JSON.stringify(mobileCompletion));
  assert.ok(mobileCompletion.time > 0);
  const mobileResult = mobile.locator('.rc-card.result');
  await mobileResult.waitFor({ timeout: 20_000 });
  const titleLines = await mobileResult.locator('h2').evaluate(el => {
    const style = getComputedStyle(el);
    return el.getBoundingClientRect().height / Number.parseFloat(style.lineHeight);
  });
  assert.ok(titleLines <= 2.1, 'small-screen result headline wrapped into ' + titleLines.toFixed(1) + ' lines');
  await mobile.screenshot({ path: 'browser-artifacts/race/mobile-small-result.png' });
  // Even when the result card scrolls, its buttons must remain reachable.
  await mobileResult.locator('[data-act="setup"]').click();
  await mobile.locator('.rc-setup').waitFor();
  await mobileContext.close();

  // Local online lobby smoke: duplicate launch taps must create only one lobby,
  // closing it must restore the race setup, and exit must clean up the overlay.
  const lobbyContext = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const lobbyPage = await lobbyContext.newPage();
  lobbyPage.on('pageerror', error => errors.push('online lobby: ' + error.message));
  await lobbyPage.goto(origin + '/?pvp=local');
  await lobbyPage.locator('#start-race').click();
  await lobbyPage.locator('.rc-setup').waitFor();
  await lobbyPage.evaluate(() => {
    const button = document.querySelector('.rc-setup [data-setup="pvp"]');
    button.click(); button.click();
  });
  await lobbyPage.locator('.pvp-root').waitFor();
  assert.equal(await lobbyPage.locator('.pvp-root').count(), 1, 'duplicate online lobby created');
  await lobbyPage.locator('.pvp-root [data-act="close"]').click();
  await lobbyPage.locator('.pvp-root').waitFor({ state: 'detached' });
  await lobbyPage.locator('.rc-setup [data-setup="pvp"]').click();
  await lobbyPage.locator('.pvp-root').waitFor();
  await lobbyPage.evaluate(() => document.querySelector('.rc-setup [data-setup="exit"]').click());
  await lobbyPage.waitForFunction(() => !document.querySelector('.rc-root') && !document.querySelector('.pvp-root'));
  await lobbyContext.close();

  assert.deepEqual(errors, [], 'Uncaught browser errors');
  console.log('SPEED RUSH browser smoke OK:', completion);
} finally {
  await browser?.close();
  server.kill();
}
