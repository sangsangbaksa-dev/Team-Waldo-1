import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Run by GitHub Actions in a normal Playwright environment. Explicit DEV fixtures
// isolate UI/persistence assertions; they are recorded in report.json, never
// presented as an unassisted complete playthrough or physical-device benchmark.
const port = 4180, origin = `http://127.0.0.1:${port}`;
const artifacts = 'browser-artifacts/frontiers';
const maps = [
  { id: 'classic', title: '강철 분지', size: 520, posts: 9, home: 112, biome: 'industrial' },
  { id: 'frontier', title: '황혼 변경', size: 780, posts: 13, home: 210, biome: 'desert' },
  { id: 'continental', title: '서리 대륙', size: 1040, posts: 17, home: 300, biome: 'tundra' },
];
const cases = maps.flatMap(map => [false, true].map(grand => ({
  map, grand, name: `${map.id}-${grand ? 'grand' : 'classic'}-desktop`,
  viewport: { width: 1440, height: 900 },
}))).concat([
  { map: maps[2], grand: false, name: 'continental-classic-portrait', viewport: { width: 390, height: 844 } },
  { map: maps[1], grand: true, name: 'frontier-grand-landscape', viewport: { width: 844, height: 390 } },
]);
const report = {
  commit: process.env.GITHUB_SHA ?? 'local', started: new Date().toISOString(),
  methodology: {
    runtime: 'Actual Chromium with WebGL (SwiftShader); real DOM controls and localStorage',
    limits: 'DEV resource/wounded-unit fixtures and explicit simulation pauses are disclosed per case. This is not a full unassisted match or physical mobile GPU measurement.',
  },
  cases: [],
};
let browser, serverOutput = '';
await mkdir(artifacts, { recursive: true });
const saveReport = () => writeFile(`${artifacts}/report.json`, JSON.stringify(report, null, 2));
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', chunk => { serverOutput += chunk; });
server.stderr.on('data', chunk => { serverOutput += chunk; });
server.on('error', error => { serverOutput += `\n${error.stack ?? error.message}`; });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const screenshot = (page, name) => page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true, animations: 'disabled' });
const state = page => page.evaluate(() => {
  const w = window.__war.world;
  return { time: w.time, mapId: w.mapId, grandBattle: Boolean(w.grandBattle), difficulty: w.difficulty,
    outposts: w.outposts.length, factions: w.factions.map(f => ({ x: f.x, z: f.z })), zone: w.zone,
    army: [0, 1, 2, 3].map(id => w.units.filter(unit => unit.owner === id && unit.hp > 0).length),
    operations: JSON.parse(JSON.stringify(w.operations)), squadOrders: JSON.parse(JSON.stringify(w.squadOrders)),
  };
});
const setPaused = async (page, value) => {
  await page.evaluate(value => { window.__war.setPaused(value); window.__war.ui(); }, value);
};
async function pane(page, name) {
  const tab = page.locator(`#tab-${name}`);
  if (!await tab.isVisible() && await page.locator('#panel-toggle').isVisible()) await page.locator('#panel-toggle').click();
  await tab.click();
  await page.locator(`#pane-${name}`).waitFor({ state: 'visible' });
}
async function action(page, selector) {
  // Commands are actual visible clicks while the game is running. A developer
  // pause immediately afterwards makes the resulting state repeatable to inspect.
  await setPaused(page, false);
  await page.locator(selector).click();
  await setPaused(page, true);
}
async function assertInside(page, selector) {
  const box = await page.locator(selector).evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
      viewportWidth: innerWidth, viewportHeight: innerHeight,
      width: element.clientWidth, scrollWidth: element.scrollWidth };
  });
  assert.ok(box.left >= -1 && box.right <= box.viewportWidth + 1 && box.top >= -1 && box.bottom <= box.viewportHeight + 1,
    `${selector} exceeds the viewport: ${JSON.stringify(box)}`);
  assert.ok(box.scrollWidth <= box.width + 1, `${selector} content overflows horizontally`);
  return box;
}
async function waitForBattle(page) {
  await page.locator('.war-ui').waitFor({ timeout: 45000 });
  assert.equal(await page.locator('.war-fallback').count(), 0, 'A WebGL fallback does not count as rendering the new map');
  await page.waitForFunction(() => window.__war?.renderer.info.render.calls > 0 && window.__war.world.time >= .1, null, { timeout: 45000 });
  await page.evaluate(() => {
    window.__war.skipDrop();
    document.querySelector('#adventure-strategy')?.click();
    window.__war.setPaused(true); window.__war.ui();
  });
  return page.evaluate(() => {
    const renderer = window.__war.renderer, gl = renderer.getContext();
    return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
      contextLost: gl.isContextLost(), version: gl.getParameter(gl.VERSION) };
  });
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) break;
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* Vite startup. */ }
    await sleep(250);
  }
  assert.ok(ready, `Vite did not start\n${serverOutput}`);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  for (const scenario of cases) {
    const { map, grand, name, viewport } = scenario;
    const context = await browser.newContext({ viewport, isMobile: viewport.width < 900, hasTouch: viewport.width < 900, reducedMotion: 'reduce' });
    const page = await context.newPage(); page.setDefaultTimeout(20000);
    const result = { name, mapId: map.id, grandBattle: grand, viewport, status: 'running', stage: 'menu',
      pageErrors: [], consoleErrors: [], fixtures: ['DEV freeze after startup, resumed around each real action', 'DEV skip parachute after the real 3D scene has rendered'] };
    report.cases.push(result);
    const stage = async value => { result.stage = value; console.log(`FRONTIERS ${name}: ${value}`); await saveReport(); };
    page.on('pageerror', error => result.pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') result.consoleErrors.push(message.text()); });
    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-edition="frontiers"]').waitFor();
      assert.equal(await page.locator('[data-map]').count(), 3);
      await page.locator(`[data-map="${map.id}"]`).click();
      assert.equal(await page.locator(`[data-map="${map.id}"]`).getAttribute('aria-pressed'), 'true');
      assert.ok((await page.locator('#launch-map-name').innerText()).includes(map.title));
      await page.locator('#difficulty-easy').click();
      await page.locator('#preferences').click();
      await page.locator('#menu-quality').selectOption('standard');
      await page.locator('#menu-sound').uncheck(); await page.locator('#menu-motion').check();
      await page.locator('.dialog-cancel').click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Map picker overflows horizontally');
      await screenshot(page, `${name}-menu`);
      await page.locator(grand ? '#start-grand' : '#start-war').click();
      await stage('map and real WebGL');
      result.gpu = await waitForBattle(page);
      assert.ok(result.gpu.calls > 0 && result.gpu.triangles > 0 && !result.gpu.contextLost);
      const initial = await state(page); result.initial = initial;
      assert.equal(initial.mapId, map.id);
      assert.equal(initial.grandBattle, grand);
      assert.equal(initial.difficulty, 'easy');
      assert.equal(initial.outposts, map.posts);
      assert.deepEqual(initial.factions[0], { x: -map.home, z: -map.home });
      assert.deepEqual(initial.army, grand ? [100, 167, 167, 166] : [4, 4, 4, 4]);
      assert.equal(initial.zone, map.size / 2 - 6);
      assert.equal(await page.locator('.war-ui').getAttribute('data-biome'), map.biome);
      assert.ok((await page.locator('#territory-count').innerText()).includes(String(map.posts)));
      await pane(page, 'orders');
      assert.equal(await page.locator('#outposts button').count(), map.posts);
      await screenshot(page, `${name}-battle`);

      await stage('squad and expedition contracts');
      // Existing UI actions split a genuine independent squad in either army mode.
      await page.locator('.squad-tabs [data-squad-select="1"]').click();
      await action(page, '#squad-assign');
      assert.equal(await page.evaluate(() => window.__war.world.units.filter(unit => unit.owner === 0 && unit.squad === 1).length), grand ? 25 : 3);
      result.fixtures.push('DEV set player gold/food to 10000 and wound one selected-squad soldier to 10 HP');
      await page.evaluate(() => {
        const w = window.__war.world;
        w.factions[0].gold = 10000; w.factions[0].food = 10000;
        w.units.find(unit => unit.owner === 0 && unit.squad === 1).hp = 10;
        window.__war.ui();
      });
      if (!grand) {
        await pane(page, 'economy');
        await action(page, '#build-mine'); await action(page, '#build-farm');
      }
      await pane(page, 'operations');
      await page.locator('[data-support-squad="1"]').click();
      assert.equal(await page.locator('[data-support-squad="1"]').getAttribute('aria-pressed'), 'true');
      // Paused actions are disabled, then become executable when the game resumes.
      assert.equal(await page.locator('#support-medical').isDisabled(), true);
      await action(page, '#support-medical');
      assert.equal((await state(page)).operations.supportUses, 1);
      assert.ok(await page.evaluate(() => window.__war.world.units.find(unit => unit.owner === 0 && unit.squad === 1).hp > 10));
      await action(page, '#support-march'); await action(page, '#support-shield');
      const supported = await state(page);
      assert.equal(supported.operations.supportUses, 3);
      assert.deepEqual(supported.operations.effects.map(effect => [effect.kind, effect.squad]).sort(), [['march', 1], ['shield', 1]]);
      assert.ok(supported.operations.effects.every(effect => effect.expiresAt > supported.time));
      assert.ok((await page.locator('[data-support="march"] [data-support-label]').innerText()).includes('효과'));
      await action(page, '[data-claim-contract="foundation"]');
      assert.equal(await page.locator('[data-claim-contract="foundation"]').isDisabled(), true);
      assert.equal((await state(page)).operations.claimed.filter(id => id === 'foundation').length, 1);
      assert.ok((await page.locator('#contract-count').innerText()).startsWith('1 /'));
      await screenshot(page, `${name}-operations`);

      await stage('atlas overview, pause, and reviewed order');
      await setPaused(page, false);
      await page.locator('#open-atlas').click();
      await page.locator('.atlas-dialog').waitFor();
      result.atlasBounds = await assertInside(page, '.atlas-dialog');
      assert.equal(await page.locator('#atlas-map').count(), 1);
      assert.equal(await page.locator('[data-atlas-post]').count(), map.posts);
      const atlasTime = (await state(page)).time;
      await page.waitForTimeout(250);
      assert.equal((await state(page)).time, atlasTime, 'The real atlas dialog must pause simulation');
      await page.locator('[data-atlas-squad="1"]').click();
      const previousOrder = (await state(page)).squadOrders[1];
      await page.locator(`[data-atlas-post="${map.posts - 1}"]`).click();
      assert.deepEqual((await state(page)).squadOrders[1], previousOrder, 'Selecting an atlas destination must not issue an order before confirmation');
      assert.ok((await page.locator('#atlas-selection-text').innerText()).length > 0);
      await page.keyboard.press('Escape');
      await page.locator('.atlas-dialog').waitFor({ state: 'hidden' });
      assert.deepEqual((await state(page)).squadOrders[1], previousOrder, 'Cancelling an atlas selection must leave the existing order untouched');
      assert.ok(await page.locator('#open-atlas').evaluate(element => element === document.activeElement), 'Atlas cancellation must restore focus to its opener');
      await page.locator('#open-atlas').click();
      await page.locator('[data-atlas-squad="1"]').click();
      await page.locator(`[data-atlas-post="${map.posts - 1}"]`).click();
      await screenshot(page, `${name}-atlas`);
      await page.locator('#atlas-order').click();
      await page.locator('.atlas-dialog').waitFor({ state: 'hidden' });
      await setPaused(page, true);
      assert.deepEqual((await state(page)).squadOrders[1], { kind: 'outpost', id: map.posts - 1 });

      await stage('save, map-preserving resume, and support persistence');
      await page.locator('#save').click();
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('team-waldo-3d-war-v1')));
      assert.equal(saved.version, 4);
      assert.equal(saved.war.mapId, map.id);
      assert.equal(saved.war.grandBattle, grand);
      assert.equal(saved.war.outposts.length, map.posts);
      assert.ok(saved.war.operations.claimed.includes('foundation'));
      assert.equal(saved.war.operations.supportUses, 3);
      await page.locator('#exit').click();
      await page.locator('#continue-war').waitFor();
      assert.ok((await page.locator('#continue-war').innerText()).includes(map.title));
      const differentMap = map.id === 'classic' ? 'continental' : 'classic';
      await page.locator(`[data-map="${differentMap}"]`).click();
      await page.locator('#continue-war').click();
      await waitForBattle(page);
      const resumed = await state(page); result.resumed = resumed;
      assert.equal(resumed.mapId, map.id);
      assert.equal(resumed.grandBattle, grand);
      assert.equal(resumed.outposts, map.posts);
      assert.deepEqual(resumed.operations.claimed, saved.war.operations.claimed);
      assert.deepEqual(resumed.operations.readyAt, saved.war.operations.readyAt);
      assert.equal(resumed.operations.supportUses, 3);
      assert.deepEqual(resumed.squadOrders[1], saved.war.squadOrders[1]);
      assert.ok(resumed.time >= saved.war.time, 'Resume moved simulation time backwards');
      await pane(page, 'operations');
      assert.equal(await page.locator('[data-claim-contract="foundation"]').isDisabled(), true);
      assert.equal(await page.locator('[data-claim-contract="foundation"]').innerText(), '수령 완료');
      await screenshot(page, `${name}-resumed`);

      if (map.id === 'continental' && grand) {
        await stage('same-map retry after explicit terminal-world fixture');
        result.fixtures.push('DEV terminal victory state solely to verify result/retry routing; not an unassisted win');
        await page.evaluate(() => {
          const { world, finish } = window.__war;
          for (const faction of world.factions.slice(1)) { faction.hp = 0; faction.alive = false; faction.target = null; faction.rally = null; }
          world.factions[0].target = null; world.factions[0].rally = null;
          world.units = world.units.filter(unit => unit.owner === 0);
          for (const post of world.outposts) { post.owner = null; post.contender = null; post.progress = 0; }
          world.squadOrders = [null, null, null]; world.over = true; world.winner = 0; finish();
        });
        await page.locator('#again').click(); await waitForBattle(page);
        const retry = await state(page);
        assert.equal(retry.mapId, 'continental'); assert.equal(retry.grandBattle, true);
        assert.deepEqual(retry.operations.claimed, []);
        assert.equal(retry.operations.supportUses, 0);
      }
      assert.deepEqual(result.pageErrors, [], 'Uncaught browser errors');
      assert.deepEqual(result.consoleErrors, [], 'Browser console errors');
      result.status = 'passed';
      console.log(`PASS ${name}: ${map.size}×${map.size}, ${map.posts} posts, real support/contract/atlas/save controls`);
    } catch (error) {
      result.status = 'failed'; result.error = String(error.stack ?? error); process.exitCode = 1;
      await screenshot(page, `${name}-failure`).catch(() => undefined);
      console.error(`FAIL ${name}: ${result.error}`);
    } finally {
      await context.close(); await saveReport();
    }
  }
} catch (error) {
  report.error = String(error.stack ?? error); process.exitCode = 1; console.error(report.error);
} finally {
  report.finished = new Date().toISOString();
  await saveReport(); await writeFile(`${artifacts}/vite.log`, serverOutput);
  await browser?.close().catch(() => undefined);
  server.kill('SIGTERM');
}
