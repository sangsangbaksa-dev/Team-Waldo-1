import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Real-browser SLACK OFF regression. Runs against a local Vite dev server;
// never touches the production deployment or another game's save data.
const port = 4191;
const origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
for (const stream of [server.stdout, server.stderr]) {
  stream.on('data', data => { serverLog += data.toString(); });
}
server.on('error', error => { serverLog += String(error); });

const devices = [
  { name: 'desktop', width: 1280, height: 800, mobile: false },
  { name: 'phone', width: 390, height: 844, mobile: true },
  { name: 'compact', width: 320, height: 640, mobile: true },
  { name: 'landscape', width: 844, height: 390, mobile: true },
];
const results = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
await mkdir('browser-artifacts', { recursive: true });
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) break;
    try { if ((await fetch(origin)).ok) { ready = true; break; } }
    catch { /* Vite may still be starting. */ }
    await sleep(200);
  }
  assert.ok(ready, 'SLACK OFF local Vite server did not start: ' + serverLog);
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  for (const size of devices) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      isMobile: size.mobile, hasTouch: size.mobile, reducedMotion: 'reduce',
    });
    await context.addInitScript(() => {
      // Instrument the native WebAudio source only in this smoke harness.
      // A three-argument start() proves the cached random-offset noise path ran.
      window.__slackNoiseStarts = [];
      if (globalThis.AudioBufferSourceNode?.prototype?.start) {
        const originalStart = AudioBufferSourceNode.prototype.start;
        AudioBufferSourceNode.prototype.start = function (...args) {
          if (args.length === 3) window.__slackNoiseStarts.push(args);
          return originalStart.apply(this, args);
        };
      }
      localStorage.setItem('waldo.slack.tutorial.v1', '1');
      localStorage.setItem('waldo.preferences.v1', JSON.stringify({
        sound: false, quality: 'low', reducedMotion: true,
      }));
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(String(error.message)));
    const snap = suffix => page.screenshot({
      path: 'browser-artifacts/slack-off-' + size.name + '-' + suffix + '.png',
      animations: 'disabled',
    });
    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await page.locator('#start-slack').click();
      await page.locator('[data-title]:visible').waitFor();
      await page.locator('[data-stage="class"]').click();
      await page.locator('[data-level="2"]').click();
      await page.locator('[data-title] [data-start]').click();
      await page.locator('.sl-class').waitFor();
      await page.locator('.sl-class [data-activity="game"]').click();
      await page.locator('.sl-room[data-view="game"]').waitFor();
      if (size.mobile) {
        const sizePx = await page.locator('.sl-gbar button').first()
          .evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize));
        assert.ok(sizePx >= 10, 'Touch RTS toolbar labels should be at least 10 CSS px');
      }
      const canvas = page.locator('.sl-win.gm canvas');
      await canvas.click({ position: { x: 12, y: 12 } });
      const cursor = page.locator('#sl-rts-cursor');
      const before = await cursor.textContent();
      assert.match(before ?? '', /지휘 위치/);
      await page.keyboard.press('ArrowRight');
      const after = await cursor.textContent();
      assert.notEqual(after, before, 'ArrowRight should move cursor from pointer command location');
      await snap('classroom');

      await page.locator('.sl-hud [data-pause]').click();
      await page.locator('[data-paused]:visible').waitFor();
      await page.locator('[data-paused] [data-sound]').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('[data-paused] [data-resume]').evaluate(
        node => document.activeElement === node), true, 'Paused dialog must trap Tab');
      await page.locator('[data-paused] [data-resume]').click();
      await page.locator('[data-paused]').waitFor({ state: 'hidden' });
      // The deployed version previously kept advancing after window blur.
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await page.locator('[data-paused]:visible').waitFor();
      await page.locator('[data-paused] [data-resume]').click();
      await page.locator('[data-paused]').waitFor({ state: 'hidden' });
      await page.locator('.sl-hud [data-pause]').click();
      await page.locator('[data-paused] [data-exit]').click();
      await page.locator('#start-slack').waitFor();

      await page.locator('#start-slack').click();
      await page.locator('[data-title]:visible').waitFor();
      await page.locator('[data-stage="dorm"]').click();
      await page.locator('[data-title] [data-start]').click();
      await page.locator('.slack-computer').waitFor();
      const cover = page.locator('.sc-cover-button');
      const bounds = await cover.boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 &&
        bounds.x + bounds.width <= size.width + 1 &&
        bounds.y + bounds.height <= size.height + 1,
        'Dorm cover must be reachable in the viewport');

      assert.equal(await page.locator('.sc-apps [data-app]').count(), 6);
      await page.locator('.sc-apps [data-app="shop"]').click();
      await page.locator('.sc-app-shop').waitFor({ state: 'visible' });
      if (!size.mobile) {
        // Exercise real WebAudio in Chromium (not only the mocked unit tests).
        await page.locator('.sl-hud [data-sound]').click();
        await page.waitForTimeout(150);
      }
      const total = page.locator('.sc-app-shop [data-total]');
      assert.equal(await total.getAttribute('role'), 'status');
      await page.locator('.sc-app-shop [data-add="1"]').click();
      assert.equal(await total.textContent(), '합계 8,385원', 'Ordinary item should be 35% off');
      await page.locator('.sc-app-shop [data-add="deal"]').click();
      assert.equal(await total.textContent(), '합계 14,835원', 'Flash deal should be 50% off');
      assert.equal(await page.locator('.sc-app-shop [data-add="1"]').textContent(), '담김 ×2');

      // Simulate a lost touch-pointer capture: the eventual release may be
      // delivered on window instead of the cover button. The player must not
      // become permanently stuck in the study-cover overlay.
      await cover.dispatchEvent('pointerdown', { pointerId: 42, pointerType: 'touch', button: 0, isPrimary: true });
      assert.equal(await cover.getAttribute('aria-pressed'), 'true', 'Hold-to-study should activate');
      await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, pointerId: 42, pointerType: 'touch', button: 0,
      })));
      assert.equal(await cover.getAttribute('aria-pressed'), 'false', 'Off-element release should end the cover hold');

      if (!size.mobile) {
        const segments = await page.evaluate(() => window.__slackNoiseStarts);
        assert.ok(segments.length >= 1, 'An audible shopping click should use the native cached noise source');
        for (const [when, offset, duration] of segments) {
          assert.ok(Number.isFinite(when) && offset >= 0 && duration > 0 &&
            offset + duration <= 1.001, 'Noise source must read a valid one-second buffer segment');
        }
      }
      await snap('dorm-shop');

      // Repeated restart must dispose the old view, rebuild a single set of
      // app windows and clear the previous run's shopping cart.
      await page.locator('.sl-hud [data-pause]').click();
      await page.locator('[data-paused]:visible').waitFor();
      await page.locator('[data-paused] [data-restart]').click();
      await page.locator('.slack-computer').waitFor();
      assert.equal(await page.locator('.slack-computer').count(), 1, 'Restart should retain one dorm view');
      await page.locator('.sc-apps [data-app="chat"]').click();
      await page.locator('.sc-app-chat').waitFor({ state: 'visible' });
      await page.locator('.sc-apps [data-app="shop"]').click();
      await page.locator('.sc-app-shop').waitFor({ state: 'visible' });
      assert.equal(await page.locator('.sc-app-shop [data-total]').textContent(), '합계 0원',
        'Restart must clear the old shopping cart');
      await page.locator('.sl-hud [data-pause]').click();
      await page.locator('[data-paused] [data-exit]').click();
      await page.locator('.sl-root').waitFor({ state: 'detached' });
      await page.locator('#start-slack').waitFor();
      assert.deepEqual(errors, [], 'Unexpected unhandled browser errors');
      results.push({ viewport: size.name, status: 'passed', shopTotal: 14835 });
      console.log('PASS SLACK OFF real browser: ' + size.name);
    } catch (error) {
      results.push({ viewport: size.name, status: 'failed', error: String(error.stack ?? error), pageErrors: errors });
      process.exitCode = 1;
      await snap('failure').catch(() => undefined);
      console.error('FAIL SLACK OFF real browser: ' + size.name, error);
    } finally {
      await context.close();
    }
  }
} catch (error) {
  process.exitCode = 1;
  results.push({ status: 'failed', error: String(error.stack ?? error) });
  console.error(error);
} finally {
  await writeFile('browser-artifacts/slack-off-report.json', JSON.stringify(results, null, 2));
  await browser?.close().catch(() => undefined);
  server.kill('SIGTERM');
}
