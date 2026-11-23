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
      const titleDrawsBefore = await page.evaluate(() => window.__sky.renderer.info.render.frame);
      await sleep(310);
      const titleDrawsAfter = await page.evaluate(() => window.__sky.renderer.info.render.frame);
      assert.ok(titleDrawsAfter - titleDrawsBefore <= 5,
        'The menu should not draw the 3D world at 60fps behind its overlay');
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
      const assistChoice = page.locator('[data-k="assist"]');
      await assistChoice.click();
      assert.match(await assistChoice.innerText(), /끔/, 'Manual mode is enabled for click tests');
      await page.locator('#sk-start').click();
      await page.locator('.sk-hud').waitFor({ state: 'visible' });
      await page.waitForFunction(() => !!window.__sky?.sim);
      assert.equal(await page.evaluate(() => document.pointerLockElement === null), true, 'Default controls should not lock pointer');
      if (size.name === 'desktop') {
        // A canceled mouse event must not leave its queued missile press active.
        await page.evaluate(() => {
          const canvas = document.querySelector('.sk-canvas');
          canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 2, pointerType: 'mouse' }));
          canvas.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, button: -1, pointerType: 'mouse' }));
        });
        await sleep(140);
        assert.doesNotMatch(await page.locator('#sk-alert').innerText(), /락온 대상 없음/,
          'A canceled right-click must not queue a phantom missile press');
      }
      await page.evaluate(() => { window.__sky.sim.intermission = 0; });
      await page.waitForFunction(() => window.__sky?.sim?.wave >= 1);
      const flight = await page.evaluate(() => {
        const sim = window.__sky.sim, renderer = window.__sky.renderer;
        return { wave: sim.wave, enemies: sim.enemies().length, calls: renderer.info.render.calls, altitude: sim.player.pos.y };
      });
      assert.ok(flight.enemies > 0, 'The first wave must spawn enemies');
      assert.ok(flight.calls > 0, 'Three.js must issue WebGL draw calls');
      assert.ok(flight.altitude > 100, 'Aircraft must have a valid starting altitude');
      const seaOffset = await page.evaluate(() => {
        const view = window.__sky.view, t = view.seaNormalMap, p = view.camera.position;
        return { x: t.offset.x, y: t.offset.y, expectedX: p.x * t.repeat.x / 20000,
          expectedY: -p.z * t.repeat.y / 20000 };
      });
      assert.ok(Math.abs(seaOffset.x - seaOffset.expectedX) < 0.01 &&
        Math.abs(seaOffset.y - seaOffset.expectedY) < 0.01,
      'The sea normal map must remain fixed in world space at every texture quality');
      const playerOnScreen = await page.evaluate(() => window.__sky.view.project(window.__sky.sim.player.pos));
      assert.ok(Math.abs(playerOnScreen.x - 0.5) < 0.12, 'Third-person camera should begin centered behind the jet');
      const sunDirectionError = await page.evaluate(() => {
        const v = window.__sky.view;
        return v.sunGlow.position.clone().sub(v.camera.position).distanceTo(v.shadowSun.clone().multiplyScalar(7000));
      });
      assert.ok(sunDirectionError < 0.01,
        'The visible sky sun must use the fixed directional-light vector, not the player offset');
      await page.screenshot({ path: 'browser-artifacts/sky-flight-' + size.name + '.png', animations: 'disabled' });
      await page.waitForFunction(() => !document.querySelector('#sk-banner')?.classList.contains('on'));
      await page.screenshot({ path: 'browser-artifacts/sky-combat-' + size.name + '.png', animations: 'disabled' });
      const clouds = await page.evaluate(() => {
        const view = window.__sky.view;
        const total = view.clouds.length;
        view.setLevel(3);
        const hidden = view.clouds.filter(sprite => !sprite.visible).length;
        const roughInLowTier = view.sea.material.roughness;
        view.setLevel(0);
        const restored = view.clouds.filter(sprite => sprite.visible).length;
        return { total, hidden, restored, roughInLowTier,
          seaRoughness: view.sea.material.roughness,
          seaNormalScale: view.sea.material.normalScale.x };
      });
      assert.ok(clouds.roughInLowTier >= 0.6, 'Adaptive low tier must smooth water highlights');
      assert.ok(clouds.seaRoughness >= 0.6 && clouds.seaNormalScale <= 0.4,
        'Low quality mode must avoid high-frequency sea shimmer');
      assert.ok(clouds.total >= 30, 'The atmosphere must register all cloud sprite layers');
      assert.equal(clouds.hidden, clouds.total, 'Low quality must cull both cloud layers');
      assert.equal(clouds.restored, clouds.total, 'Restored quality must show all cloud layers again');

      // Trackpad micro-clicks and short touch taps must not be lost between RAF frames.
      if (size.name === 'desktop') {
        const before = await page.evaluate(() => window.__sky.sim.shots);
        await page.evaluate(() => {
          const canvas = document.querySelector('.sk-canvas');
          canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, pointerType: 'mouse' }));
          canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, buttons: 0, pointerType: 'mouse' }));
        });
        await page.waitForFunction(previous => window.__sky.sim.shots > previous, before);
        const afterClick = await page.evaluate(() => window.__sky.sim.shots);
        await page.evaluate(() => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
          window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
        });
        await page.waitForFunction(previous => window.__sky.sim.shots > previous, afterClick);
      } else {
        const before = await page.evaluate(() => window.__sky.sim.shots);
        await page.locator('.sk-canvas').tap({ position: { x: size.width / 2, y: size.height * 0.4 } });
        await page.waitForFunction(previous => window.__sky.sim.shots > previous, before);
        const beforeTwoFingers = await page.evaluate(() => window.__sky.sim.shots);
        await page.evaluate(() => {
          window.__sky.sim.player.lockId = 0; window.__sky.sim.player.lockT = 0; window.__sky.sim.player.missileCd = 0;
          const canvas = document.querySelector('.sk-canvas');
          const emit = (type, id, x) => canvas.dispatchEvent(new PointerEvent(type, {
            bubbles: true, pointerId: id, pointerType: 'touch', clientX: x, clientY: 320,
          }));
          emit('pointerdown', 101, 130); emit('pointerdown', 102, 185);
          emit('pointerup', 102, 185); emit('pointerup', 101, 130);
        });
        await page.waitForFunction(() => document.querySelector('#sk-alert')?.textContent.includes('락온 대상 없음'));
        assert.equal(await page.evaluate(() => window.__sky.sim.shots), beforeTwoFingers,
          'Two-finger missile tap should not trigger the gun as well');
      }
      if (size.name === 'mobile') {
        await page.locator('#sk-b-flare').dispatchEvent('pointerdown', { pointerId: 12, pointerType: 'touch' });
        await page.waitForFunction(() => window.__sky?.sim?.player?.flare > 0);
        await page.waitForFunction(() => document.querySelector('#sk-b-flare')?.disabled);
        assert.match(await page.locator('#sk-b-flare').innerText(), /[1-4]초/,
          'The touch flare button must show its cooldown');
      }
      const runsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('waldo.sky.v1') || '{}').runs || 0);
      await page.evaluate(() => {
        window.__sky.sim.time = 6.5;
        document.querySelector('#sk-alert').textContent = 'OLD WARNING';
      });
      if (size.name === 'desktop') {
        // A synthetic held key has no corresponding keyup: pausing must clear it.
        await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', bubbles: true })));
        await page.waitForFunction(() => window.__sky.sim.player.boosting === true);
        await page.keyboard.press('p');
      } else await page.locator('#sk-pause').click();
      await page.locator('#sk-paused').waitFor({ state: 'visible' });
      await page.screenshot({ path: 'browser-artifacts/sky-paused-' + size.name + '.png', animations: 'disabled' });
      // Preserve the old model reference across restart to detect reused IDs.
      await page.evaluate(() => {
        window.__skyPreviousAircraft = window.__sky.view.meshes.get(window.__sky.sim.player.id);
      });
      const pausedAt = await page.evaluate(() => window.__sky.sim.time);
      const pausedDraws = await page.evaluate(() => window.__sky.renderer.info.render.frame);
      await sleep(180);
      const afterPause = await page.evaluate(() => window.__sky.sim.time);
      const afterPausedDraws = await page.evaluate(() => window.__sky.renderer.info.render.frame);
      assert.equal(afterPause, pausedAt, 'Pause must freeze simulation time');
      assert.equal(afterPausedDraws, pausedDraws, 'Pause must also stop expensive WebGL redraws');
      if (size.name === 'desktop') {
        await page.locator('#sk-resume').click();
        await page.waitForFunction(time => window.__sky.sim.time > time, pausedAt);
        assert.equal(await page.evaluate(() => window.__sky.sim.player.boosting), false,
          'Lost keyup during pause must not leave boost engaged on resume');
        await page.keyboard.press('p');
        await page.locator('#sk-paused').waitFor({ state: 'visible' });
      }
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
      assert.equal(await page.evaluate(() => window.__skyPreviousAircraft === window.__sky.view.meshes.get(window.__sky.sim.player.id)), false,
        'Restart must not reuse an old aircraft mesh even when the entity ID is recycled');
      // A true incoming missile warning must survive a simultaneous arena warning.
      await page.evaluate(() => {
        const sim = window.__sky.sim;
        sim.player.pos.set(3060, 900, 0);
        sim.events.push({ t: 'warn' });
      });
      await page.waitForFunction(() => document.querySelector('#sk-alert')?.textContent.includes('미사일 접근'));
      await sleep(180);
      assert.match(await page.locator('#sk-alert').innerText(), /미사일 접근/,
        'Arena warning should not immediately overwrite a missile alert');
      await page.evaluate(() => window.__sky.sim.player.pos.set(0, 900, 2200));
      if (size.name === 'desktop') await page.keyboard.press('p');
      else await page.locator('#sk-pause').click();
      await page.locator('#sk-quit3').click();
      await page.locator('#start-sky').waitFor({ state: 'visible' });
      assert.equal(await page.locator('.sk-root').count(), 0, 'Leaving SKY WAR removes the old canvas and HUD');
      assert.equal(await page.evaluate(() => window.__sky === undefined), true, 'Leaving SKY WAR removes diagnostics');
      await page.locator('#start-sky').click();
      await page.locator('#sk-title').waitFor({ state: 'visible' });
      await page.locator('#sk-start').click();
      await page.waitForFunction(() => !!window.__sky?.sim && window.__sky.sim.time > 0.05 && window.__sky.renderer.info.render.calls > 0);
      await page.evaluate(() => {
        const sim = window.__sky.sim;
        sim.damage(sim.player, 99999, -5, sim.player.pos);
      });
      await page.locator('#sk-end').waitFor({ state: 'visible' });
      await page.screenshot({ path: 'browser-artifacts/sky-result-' + size.name + '.png', animations: 'disabled' });
      assert.match(await page.locator('#sk-end-t').innerText(), /격추/, 'Game over report should appear after the aircraft is destroyed');
      const overDrawsBefore = await page.evaluate(() => window.__sky.renderer.info.render.frame);
      await sleep(320);
      const overDrawsAfter = await page.evaluate(() => window.__sky.renderer.info.render.frame);
      assert.ok(overDrawsAfter - overDrawsBefore <= 3,
        'The result menu should cap expensive 3D redraws instead of drawing at 60fps');
      const overQualityLevel = await page.evaluate(() => window.__sky.view.level);
      await page.locator('#sk-again').click();
      await page.locator('#sk-end').waitFor({ state: 'hidden' });
      await page.waitForFunction(() => window.__sky?.sim?.player?.alive && window.__sky.sim.time > 0.05);
      assert.equal(await page.evaluate(() => window.__sky.view.level), overQualityLevel,
        'Restart after a long game-over screen must not downgrade adaptive quality');
      if (size.name === 'desktop') await page.keyboard.press('p');
      else await page.locator('#sk-pause').click();
      await page.locator('#sk-paused').waitFor({ state: 'visible' });
      await page.locator('#sk-quit3').click();
      await page.locator('#start-sky').waitFor({ state: 'visible' });
      assert.equal(await page.locator('.sk-root').count(), 0, 'Repeated entry/exit must clean up all SKY WAR DOM');
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
