import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// This gate exercises the real public, minified application. No development
// handles, injected game state, network mocks, or storage writes are used.
const origin = 'https://team-waldo-3d-war.vercel.app/';
const artifacts = 'browser-artifacts/production';
const report = { commit: process.env.GITHUB_SHA ?? 'local', origin, started: new Date().toISOString(), deployment: { attempts: [] }, cases: [] };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const persist = () => writeFile(`${artifacts}/report.json`, JSON.stringify(report, null, 2));
const capture = (page, name) => page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true, animations: 'disabled', timeout: 20000 });
const sha256 = value => createHash('sha256').update(value).digest('hex');
let browser;

function entryFromHtml(html) {
  const scripts = html.match(/<script\b[^>]*>/gi) ?? [];
  const module = scripts.find(tag => /\btype\s*=\s*["']module["']/i.test(tag));
  const source = module?.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
  assert.ok(source, 'HTML does not contain a module entry script');
  const url = new URL(source, origin);
  assert.equal(url.origin, new URL(origin).origin, 'Unexpected cross-origin entry script');
  const hash = url.pathname.match(/^\/assets\/index-([\w-]+)\.js$/)?.[1];
  assert.ok(hash, `Expected a Vite hashed entry script, received ${url.pathname}`);
  return { path: url.pathname, hash };
}

async function waitForDeployment() {
  const expected = entryFromHtml(await readFile('dist/index.html', 'utf8'));
  report.deployment.expected = expected;
  const deadline = Date.now() + 180000;
  let observed;
  while (Date.now() < deadline) {
    const attempt = { at: new Date().toISOString() };
    try {
      const url = new URL(origin); url.searchParams.set('production-smoke', `${Date.now()}-${report.deployment.attempts.length}`);
      const response = await fetch(url, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(Math.max(1, Math.min(10000, deadline - Date.now()))) });
      attempt.status = response.status;
      assert.ok(response.ok, `Public HTML returned HTTP ${response.status}`);
      observed = entryFromHtml(await response.text()); attempt.entry = observed;
      if (observed.path === expected.path) {
        // The name establishes deployment identity; compare the actual entry
        // bytes as well so an HTML-only or stale-asset update cannot pass.
        const asset = await fetch(new URL(expected.path, origin), { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        assert.ok(asset.ok, `Public entry script returned HTTP ${asset.status}`);
        const remoteHash = sha256(Buffer.from(await asset.arrayBuffer()));
        const localHash = sha256(await readFile(`dist${expected.path}`));
        assert.equal(remoteHash, localHash, 'Public entry bytes differ from the local production build');
        report.deployment.attempts.push(attempt);
        report.deployment.actual = observed; report.deployment.entrySha256 = remoteHash;
        report.deployment.matchedAt = new Date().toISOString();
        console.log(`Deployment matched ${expected.path}`); await persist(); return;
      }
    } catch (error) { attempt.error = String(error.message ?? error); }
    report.deployment.attempts.push(attempt);
    console.log(`Waiting for public deployment: expected ${expected.hash}, observed ${observed?.hash ?? 'unavailable'}`);
    await persist();
    await sleep(Math.min(5000, Math.max(0, deadline - Date.now())));
  }
  throw new Error(`Public alias did not match this build within 180 seconds. Expected ${expected.path}; last observed ${observed?.path ?? 'unavailable'}. No browser pass is claimed.`);
}

async function assertProduction(page) {
  assert.equal(await page.evaluate(() => Object.hasOwn(window, '__war')), false, 'Development game handle leaked into production');
  assert.equal(await page.locator('script[type="module"][src]').evaluate(element => new URL(element.src).pathname), report.deployment.expected.path, 'Browser loaded a different deployment');
}

async function waitForBattle(page) {
  await page.locator('.war-ui').waitFor({ timeout: 30000 });
  assert.equal(await page.locator('.war-fallback').count(), 0, 'WebGL fallback is not a passing battle');
  await page.locator('.war-view canvas').waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const fps = document.querySelector('#render-fps')?.textContent ?? '';
    return /^[1-9][0-9]* FPS$/.test(fps);
  }, null, { timeout: 30000 });
  const graphics = await page.locator('.war-view canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl2');
    if (!gl) return null;
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { contextLost: gl.isContextLost(), width: gl.drawingBufferWidth, height: gl.drawingBufferHeight,
      cssWidth: canvas.getBoundingClientRect().width, version: gl.getParameter(gl.VERSION),
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
  });
  assert.ok(graphics && !graphics.contextLost && graphics.width > 0 && graphics.height > 0, 'No valid WebGL drawing buffer');
  assert.ok(graphics.width / graphics.cssWidth <= .86, 'Selected low quality did not reduce the render resolution');
  await assertProduction(page); return graphics;
}

async function exercise(page, result) {
  const stage = async name => { result.stage = name; console.log(`PRODUCTION ${result.name}: ${name}`); await persist(); };
  await stage('landing and low-quality settings');
  const url = new URL(origin); url.searchParams.set('production-smoke', Date.now().toString());
  const response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
  assert.ok(response?.ok(), 'Public landing request failed');
  await page.locator('[data-release="kingdoms-1.0"]').waitFor(); await assertProduction(page);
  await page.locator('#guide').click(); await page.getByRole('dialog').waitFor();
  assert.match(await page.getByRole('dialog').innerText(), /거점/);
  await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.locator('#preferences').click(); await page.locator('#menu-quality').selectOption('low');
  await page.locator('#menu-sound').uncheck(); await page.locator('#menu-motion').check();
  await page.locator('.dialog-cancel').click();
  await page.locator('#difficulty-easy').click();
  assert.equal(await page.locator('#difficulty-easy').getAttribute('aria-pressed'), 'true');
  await capture(page, `${result.name}-landing`);

  await stage('real WebGL, training and capture order');
  await page.locator('#start-war').click(); result.graphics = await waitForBattle(page);
  assert.equal(await page.locator('#difficulty-badge').innerText(), '입문');
  result.fps = await page.locator('#render-fps').innerText();
  await page.locator('#tab-army').click();
  const before = Number(await page.locator('#count-infantry').innerText());
  assert.equal(before, 60, 'The allied grand army starts with 60 infantry');
  await page.locator('#train-infantry').click();
  assert.equal(Number(await page.locator('#count-infantry').innerText()), before + 1, 'Training did not add one infantry');
  result.infantryAfterTraining = before + 1;
  await page.locator('#tab-orders').click(); await page.locator('#outpost-5').click();
  assert.equal(await page.locator('#outpost-5').evaluate(element => element.classList.contains('selected')), true, 'Capture order did not become active');
  await page.locator('#save').click(); assert.match(await page.locator('#save-status').innerText(), /저장됨/);
  result.savedClock = await page.locator('#war-clock').innerText();
  await capture(page, `${result.name}-battle`);

  await stage('save, exit and continue the same army and difficulty');
  await page.locator('#exit').click(); await page.locator('#continue-war').waitFor();
  assert.match(await page.locator('#continue-war').innerText(), /입문/);
  // A different new-game selection must not alter the stored battle difficulty.
  await page.locator('#difficulty-hard').click(); await page.locator('#continue-war').click();
  result.restoredGraphics = await waitForBattle(page);
  assert.equal(await page.locator('#difficulty-badge').innerText(), '입문');
  await page.locator('#tab-army').click();
  assert.equal(Number(await page.locator('#count-infantry').innerText()), result.infantryAfterTraining, 'Saved trained infantry were not restored');
  await page.locator('#tab-orders').click();
  assert.equal(await page.locator('#outpost-5').evaluate(element => element.classList.contains('selected')), true, 'Saved capture order was not restored');

  await stage('pause and resume through visible controls');
  await page.locator('#pause').click(); await page.getByRole('dialog').waitFor();
  const pausedClock = await page.locator('.pause-stats b').first().innerText();
  // The dialog captures the paused time; allow the periodically refreshed HUD
  // to catch up before measuring it, including on slow software renderers.
  await page.waitForFunction(expected => document.querySelector('#war-clock')?.textContent === expected, pausedClock);
  await page.waitForTimeout(2500);
  assert.equal(await page.locator('#war-clock').innerText(), pausedClock, 'Visible battle clock advanced while paused');
  result.pausedClock = pausedClock; await capture(page, `${result.name}-paused`);
  await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(previous => document.querySelector('#war-clock')?.textContent !== previous, pausedClock, { timeout: 15000 });
  await page.locator('#exit').click(); await page.locator('#start-war').waitFor();

  // The retired small-battle and classic-survival buttons must stay hidden.
  assert.equal(await page.locator('#start-grand, #legacy').count(), 0);
  await assertProduction(page); await page.waitForTimeout(300);
  assert.deepEqual(result.pageErrors, [], 'Uncaught production browser errors');
  assert.deepEqual(result.consoleErrors, [], 'Production browser console errors');
  result.status = 'passed'; console.log(`PASS production ${result.name}: deployed build, WebGL, training, orders, persistence and pause`);
}

await mkdir(artifacts, { recursive: true });
try {
  await waitForDeployment();
  browser = await chromium.launch({ headless: true, timeout: 30000, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1, isMobile: viewport.name === 'mobile', hasTouch: viewport.name === 'mobile', reducedMotion: 'reduce' });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const result = { ...viewport, status: 'running', pageErrors: [], consoleErrors: [], interaction: 'visible controls only; no development state handles' };
    report.cases.push(result);
    page.on('pageerror', error => result.pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') result.consoleErrors.push(message.text()); });
    // A stuck page cannot consume the rest of the deployment job indefinitely.
    const deadline = setTimeout(() => { result.timeout = 'Scenario exceeded 150 seconds'; void context.close().catch(() => undefined); }, 150000);
    try { await exercise(page, result); }
    catch (error) {
      result.status = 'failed'; result.error = String(error.stack ?? error); process.exitCode = 1;
      await capture(page, `${result.name}-failure`).catch(() => undefined); console.error(result.error);
    } finally {
      clearTimeout(deadline); await context.close();
      if (result.pageErrors.length || result.consoleErrors.length || result.timeout) { result.status = 'failed'; process.exitCode = 1; }
      await persist();
    }
  }
} catch (error) { report.error = String(error.stack ?? error); process.exitCode = 1; console.error(report.error); }
finally {
  report.finished = new Date().toISOString(); report.status = process.exitCode ? 'failed' : 'passed';
  await persist(); await browser?.close();
}
