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
  await page.locator('[data-setup="start"]').click();
  await page.waitForFunction(() => document.querySelector('.rc-root')?.dataset.phase === 'countdown');

  // Advance the countdown without waiting for the headless software renderer.
  await page.evaluate(() => { window.__race.skip(3.3); });
  await page.waitForFunction(() => window.__race?.race?.phase === 'racing');

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
  assert.deepEqual(errors, [], 'Uncaught browser errors');
  console.log('SPEED RUSH browser smoke OK:', completion);
} finally {
  await browser?.close();
  server.kill();
}
