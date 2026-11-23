import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const port = 4188, origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
for (const stream of [server.stdout, server.stderr]) stream.on('data', data => { serverLog += data; });
server.on('error', error => { serverLog += error.message; });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
await mkdir('browser-artifacts', { recursive: true });
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) break;
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* server starting */ }
    await sleep(250);
  }
  assert.ok(ready, 'SKY WAR Vite server failed: ' + serverLog);
  browser = await chromium.launch({
    headless: true, executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });
  for (const size of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'mobile', width: 390, height: 844 }]) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      isMobile: size.name === 'mobile', hasTouch: size.name === 'mobile', reducedMotion: 'reduce',
    });
    await context.addInitScript(() => {
      localStorage.setItem('waldo.preferences.v1', JSON.stringify({ sound: false, quality: 'low', reducedMotion: true }));
    });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /WebGL|shader|GL_INVALID|THREE.WebGLProgram/i.test(message.text())) errors.push(message.text()); });
    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await page.locator('#start-sky').click();
      await page.locator('#sk-title').waitFor({ state: 'visible' });
      if (size.name === 'mobile') {
        assert.equal(await page.locator('.sk-help').evaluate(el => el.open), false, 'Mobile help should be collapsed by default');
        const startButton = await page.locator('#sk-start').boundingBox();
        assert.ok(startButton && startButton.y >= 0 && startButton.y + startButton.height <= size.height,
          'Mobile start button should be fully visible without scrolling');
      }
      await page.screenshot({ path: 'browser-artifacts/sky-title-' + size.name + '.png', animations: 'disabled' });
      const pointerChoice = page.locator('[data-k="lock"]');
      assert.match(await pointerChoice.innerText(), /자유/, 'Absolute pointer steering is the default');
      await pointerChoice.click();
      assert.match(await pointerChoice.innerText(), /잠금/, 'Pointer lock can be enabled');
      await pointerChoice.click();
      await page.locator('#sk-start').click();
      await page.locator('.sk-hud').waitFor({ state: 'visible' });
      await page.waitForFunction(() => !!window.__sky?.sim);
      assert.equal(await page.evaluate(() => document.pointerLockElement === null), true, 'Default controls should not lock pointer');
      await page.evaluate(() => { window.__sky.sim.intermission = 0; });
      await page.waitForFunction(() => window.__sky?.sim?.wave >= 1);
      const flight = await page.evaluate(() => {
        const sim = window.__sky.sim, renderer = window.__sky.renderer;
        return { wave: sim.wave, enemies: sim.enemies().length, calls: renderer.info.render.calls, altitude: sim.player.pos.y };
      });
      assert.ok(flight.enemies > 0, 'The first wave must spawn enemies');
      assert.ok(flight.calls > 0, 'Three.js must issue WebGL draw calls');
      assert.ok(flight.altitude > 100, 'Aircraft must have a valid starting altitude');
      await page.screenshot({ path: 'browser-artifacts/sky-flight-' + size.name + '.png', animations: 'disabled' });
      const clouds = await page.evaluate(() => {
        const view = window.__sky.view;
        const total = view.clouds.length;
        view.setLevel(3);
        const hidden = view.clouds.filter(sprite => !sprite.visible).length;
        view.setLevel(0);
        const restored = view.clouds.filter(sprite => sprite.visible).length;
        return { total, hidden, restored };
      });
      assert.ok(clouds.total >= 30, 'The atmosphere must register all cloud sprite layers');
      assert.equal(clouds.hidden, clouds.total, 'Low quality must cull both cloud layers');
      assert.equal(clouds.restored, clouds.total, 'Restored quality must show all cloud layers again');
      if (size.name === 'mobile') {
        await page.locator('#sk-b-flare').dispatchEvent('pointerdown', { pointerId: 12, pointerType: 'touch' });
        await page.waitForFunction(() => window.__sky?.sim?.player?.flare > 0);
      }
      const runsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('waldo.sky.v1') || '{}').runs || 0);
      await page.evaluate(() => {
        window.__sky.sim.time = 6.5;
        document.querySelector('#sk-alert').textContent = 'OLD WARNING';
      });
      if (size.name === 'desktop') await page.keyboard.press('p');
      else await page.locator('#sk-pause').click();
      await page.locator('#sk-paused').waitFor({ state: 'visible' });
      const pausedAt = await page.evaluate(() => window.__sky.sim.time);
      await sleep(180);
      const afterPause = await page.evaluate(() => window.__sky.sim.time);
      assert.equal(afterPause, pausedAt, 'Pause must freeze simulation time');
      await page.locator('#sk-restart').click();
      await page.locator('#sk-paused').waitFor({ state: 'hidden' });
      await page.waitForFunction(() => window.__sky?.sim?.time > 0);
      const restart = await page.evaluate(() => ({
        hp: window.__sky.sim.player.hp,
        runs: JSON.parse(localStorage.getItem('waldo.sky.v1') || '{}').runs || 0,
        alert: document.querySelector('#sk-alert').textContent,
        rings: window.__sky.view.rings.length,
      }));
      assert.equal(restart.hp, 100, 'Restart must produce a fresh aircraft');
      assert.equal(restart.runs, runsBefore + 1, 'Restart must preserve the previous sortie record');
      assert.equal(restart.alert, '', 'Restart must clear stale combat warnings');
      assert.equal(restart.rings, 0, 'Restart must clear lingering explosion rings');
      if (size.name === 'desktop') await page.keyboard.press('p');
      else await page.locator('#sk-pause').click();
      await page.locator('#sk-quit3').click();
      await page.locator('#start-sky').waitFor({ state: 'visible' });
      assert.deepEqual(errors, [], 'Uncaught browser or shader errors');
      console.log('PASS SKY WAR browser smoke: ' + size.name + ' (' + flight.calls + ' draw calls)');
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close().catch(() => undefined);
  server.kill('SIGTERM');
}
