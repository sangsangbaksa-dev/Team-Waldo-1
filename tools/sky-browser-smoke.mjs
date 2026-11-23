import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port = 4188, origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
for (const stream of [server.stdout, server.stderr]) stream.on('data', data => { serverLog += data; });
server.on('error', error => { serverLog += error.message; });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
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
      if (size.name === 'mobile') {
        await page.locator('#sk-b-flare').dispatchEvent('pointerdown', { pointerId: 12, pointerType: 'touch' });
        await page.waitForFunction(() => window.__sky?.sim?.player?.flare > 0);
      }
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
      const health = await page.evaluate(() => window.__sky.sim.player.hp);
      assert.equal(health, 100, 'Restart must produce a fresh aircraft');
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
