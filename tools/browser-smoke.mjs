import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// DEV inspection freezes time and arranges explicitly labelled test scenarios.
// Ordinary play, saving and restarting are exercised through visible controls.
const port = 4179, origin = `http://127.0.0.1:${port}`, artifacts = 'browser-artifacts';
const viewports = [
  { name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 },
  { name: 'small-mobile', width: 320, height: 780 }, { name: 'landscape', width: 844, height: 390 },
];
const report = { commit: process.env.GITHUB_SHA ?? 'local', started: new Date().toISOString(), cases: [] };
let browser, serverOutput = '';
const server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', chunk => { serverOutput += chunk; });
server.stderr.on('data', chunk => { serverOutput += chunk; });
server.on('error', error => { serverOutput += `\n${error.stack}`; });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const intersect = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
const capture = (page, name) => page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true, animations: 'disabled' });

async function layout(page) {
  return page.evaluate(() => {
    const rect = selector => {
      const el = document.querySelector(selector);
      if (!el || !el.getClientRects().length) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    return { width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth,
      regions: Object.fromEntries(['.war-top', '.war-panel', '.war-minimap', '.mission-card', '.camera-controls', '.war-intel'].map(s => [s, rect(s)])),
      topButtons: [...document.querySelectorAll('.war-top button')].filter(el => el.getClientRects().length).map(el => {
        const r = el.getBoundingClientRect(); return { id: el.id, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      }),
    };
  });
}
function assertLayout(boxes) {
  assert.ok(boxes.documentWidth <= boxes.width + 1, 'Horizontal page overflow');
  for (const [name, rect] of Object.entries(boxes.regions)) {
    if (rect) assert.ok(rect.width > 0 && rect.height > 0 && rect.left >= -1 && rect.right <= boxes.width + 1 && rect.top >= -1 && rect.bottom <= boxes.height + 1, `${name} outside viewport: ${JSON.stringify(rect)}`);
  }
  for (const [a, b] of [
    ['.war-top', '.war-panel'], ['.war-top', '.war-minimap'], ['.war-top', '.mission-card'], ['.war-top', '.camera-controls'], ['.war-top', '.war-intel'],
    ['.war-panel', '.war-minimap'], ['.war-panel', '.camera-controls'], ['.war-panel', '.mission-card'], ['.war-minimap', '.camera-controls'], ['.war-minimap', '.war-intel'], ['.mission-card', '.war-intel'],
  ]) if (boxes.regions[a] && boxes.regions[b]) assert.ok(intersect(boxes.regions[a], boxes.regions[b]) < 1, `${a} overlaps ${b}`);
  for (const [index, button] of boxes.topButtons.entries()) {
    assert.ok(button.left >= 0 && button.right <= boxes.width, `${button.id} outside viewport`);
    for (const next of boxes.topButtons.slice(index + 1)) assert.ok(intersect(button, next) < 1, `${button.id} overlaps ${next.id}`);
  }
}
async function waitForBattle(page) {
  await page.locator('.war-ui').waitFor({ timeout: 30000 });
  assert.equal(await page.locator('.war-fallback').count(), 0, 'WebGL fallback is not a passing 3D test');
  await page.waitForFunction(() => window.__war?.renderer.info.render.calls > 0 && window.__war.world.time >= 0.1, null, { timeout: 30000 });
  await page.evaluate(() => window.__war.setPaused(true));
  return page.evaluate(() => {
    const { renderer, world } = window.__war, gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
      webglVersion: gl.getParameter(gl.VERSION), renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), contextLost: gl.isContextLost(), time: world.time, difficulty: world.difficulty };
  });
}
const snapshot = page => page.evaluate(() => {
  const w = window.__war.world, p = w.factions[0];
  return { time: w.time, difficulty: w.difficulty, mine: p.mine, policy: p.policy, reserve: p.reserve, rally: p.rally, trained: w.stats[0].trained, weapons: p.research.weapons };
});

await mkdir(artifacts, { recursive: true });
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) break;
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* Vite is starting. */ }
    await sleep(250);
  }
  assert.ok(ready, `Vite did not start\n${serverOutput}`);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  for (const { name, width, height } of viewports) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 900, hasTouch: width < 900, reducedMotion: 'reduce' });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const result = { name, width, height, status: 'running', pageErrors: [], consoleErrors: [], scenarios: ['normal UI actions', 'DEV time freeze', 'seeded victory result'] };
    report.cases.push(result);
    page.on('pageerror', error => result.pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') result.consoleErrors.push(message.text()); });
    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await page.locator('#start-war').waitFor(); await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('[data-release="kingdoms-1.0"]').count(), 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Landing overflows horizontally');
      await page.locator('#guide').click(); await page.getByRole('dialog').waitFor();
      await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
      assert.ok(await page.locator('#guide').evaluate(el => el === document.activeElement), 'Guide must restore focus');
      await page.locator('#preferences').click();
      await page.locator('#menu-quality').selectOption(name === 'desktop' ? 'high' : 'standard');
      await page.locator('#menu-sound').uncheck(); await page.locator('#menu-motion').check(); await page.locator('.dialog-cancel').click();
      await page.locator('#difficulty-easy').click(); assert.equal(await page.locator('#difficulty-easy').getAttribute('aria-pressed'), 'true');
      await capture(page, `${name}-menu`); await page.locator('#start-war').click();
      result.gpu = await waitForBattle(page);
      assert.ok(result.gpu.calls > 0 && result.gpu.triangles > 0 && !result.gpu.contextLost, '3D frame not rendered');
      assert.equal(result.gpu.difficulty, 'easy');
      result.layout = await layout(page); await capture(page, `${name}-battle`); assertLayout(result.layout);

      await page.locator('#build-mine').click(); assert.equal((await snapshot(page)).mine, 2);
      await page.locator('#policy-growth').click(); assert.equal(await page.locator('#policy-growth').getAttribute('aria-pressed'), 'true');
      await page.locator('#tab-army').click(); assert.equal(await page.locator('#tab-army').getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('#unit-train button').count(), 8); assert.equal(await page.locator('#train-archer').isDisabled(), true);
      await page.locator('#train-infantry').click(); assert.equal((await snapshot(page)).trained, 1);
      await page.locator('#reserve-4').click(); assert.equal(await page.locator('#reserve-4').getAttribute('aria-pressed'), 'true');
      await page.locator('#tab-orders').click(); assert.equal(await page.locator('#outposts button').count(), 9);
      await page.locator('#outpost-5').click(); assert.equal((await snapshot(page)).rally, 5);
      await page.locator('#map-mode').click(); assert.equal(await page.locator('#map-mode').getAttribute('aria-pressed'), 'true');
      const map = page.locator('#war-map'), bounds = await map.boundingBox(); assert.ok(bounds);
      await map.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
      assert.equal((await snapshot(page)).rally, 4, 'Map center must target central fortress');
      if (name === 'desktop') {
        await page.locator('#tab-research').click(); assert.equal(await page.locator('#research-weapons').isDisabled(), true);
        result.scenarios.push('seeded resources for research controls');
        await page.evaluate(() => { const { world, ui } = window.__war; world.factions[0].gold = 1000; world.factions[0].food = 1000; ui(); });
        await page.locator('#tab-economy').click(); await page.locator('#build-barracks').click();
        await page.locator('#tab-research').click(); await page.locator('#research-weapons').click();
        assert.equal((await snapshot(page)).weapons, 1); await capture(page, `${name}-research`);
      }
      await page.locator('#save').click(); const expected = await snapshot(page);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('team-waldo-3d-war-v1')));
      assert.equal(saved.version, 2); assert.equal(saved.war.factions[0].policy, 'growth');
      await page.locator('#exit').click(); await page.locator('#continue-war').waitFor(); await page.locator('#continue-war').click();
      await waitForBattle(page); const restored = await snapshot(page);
      for (const key of ['difficulty', 'mine', 'policy', 'reserve', 'rally', 'trained', 'weapons']) assert.equal(restored[key], expected[key], `Save/load lost ${key}`);
      assert.ok(restored.time >= expected.time, 'Saved time moved backwards');
      await page.locator('#pause').click(); await page.getByRole('dialog').waitFor();
      const pausedTime = await page.evaluate(() => window.__war.world.time);
      await page.waitForTimeout(350); assert.equal(await page.evaluate(() => window.__war.world.time), pausedTime);
      await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.evaluate(() => window.__war.setPaused(true));
      await page.locator('#exit').click(); await page.locator('#start-war').click(); await page.getByRole('dialog').waitFor();
      await page.keyboard.press('Escape'); assert.equal(await page.locator('#continue-war').isVisible(), true);
      await page.locator('#start-war').click(); await page.locator('.dialog-confirm').click(); await waitForBattle(page);
      assert.equal((await snapshot(page)).mine, 1); assert.equal((await snapshot(page)).policy, 'balanced');

      // Explicit terminal-world fixture tests the result UI without waiting for a match.
      await page.evaluate(() => {
        const { world, finish } = window.__war;
        for (const faction of world.factions.slice(1)) { faction.hp = 0; faction.alive = false; faction.target = null; faction.rally = null; }
        world.factions[0].target = null; world.factions[0].rally = null;
        world.units = world.units.filter(unit => unit.owner === 0);
        for (const post of world.outposts) { post.owner = null; post.contender = null; post.progress = 0; }
        world.over = true; world.winner = 0; finish();
      });
      await page.locator('.result-panel').waitFor(); assert.match(await page.locator('#result-title').innerText(), /마지막 왕국/);
      await capture(page, `${name}-victory`);
      const career = await page.evaluate(() => JSON.parse(localStorage.getItem('waldo.career.v1')));
      assert.equal(career.matches, 1); assert.equal(career.wins, 1);
      await page.locator('#again').click(); await waitForBattle(page);
      assert.equal((await snapshot(page)).difficulty, 'easy'); assert.equal(await page.locator('.result-panel').count(), 0);
      assert.deepEqual(result.pageErrors, [], 'Uncaught browser errors'); assert.deepEqual(result.consoleErrors, [], 'Browser console errors');
      result.status = 'passed';
      console.log(`PASS ${name} ${width}×${height}: ${result.gpu.calls} draw calls / ${result.gpu.triangles} triangles; actions, save/resume, restart and results`);
    } catch (error) {
      result.status = 'failed'; result.error = String(error.stack ?? error); process.exitCode = 1;
      await capture(page, `${name}-failure`).catch(() => undefined); console.error(`FAIL ${name}: ${result.error}`);
    } finally { await context.close(); }
    await writeFile(`${artifacts}/report.json`, JSON.stringify(report, null, 2));
  }
} catch (error) { report.error = String(error.stack ?? error); console.error(report.error); process.exitCode = 1; }
finally {
  report.finished = new Date().toISOString();
  await writeFile(`${artifacts}/report.json`, JSON.stringify(report, null, 2)); await writeFile(`${artifacts}/vite.log`, serverOutput);
  await browser?.close().catch(() => undefined); server.kill('SIGTERM');
}
