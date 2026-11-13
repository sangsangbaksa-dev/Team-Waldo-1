import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Run by GitHub Actions in a normal Playwright environment. Explicit DEV fixtures
// isolate UI/persistence assertions; they are recorded in report.json, never
// presented as an unassisted complete playthrough or physical-device benchmark.
const port = 4180, origin = `http://127.0.0.1:${port}`;
const artifacts = 'browser-artifacts/frontiers';
const limits = { action: 12000, startup: 25000, scenario: 90000, suite: 480000, screenshot: 8000 };
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
    limits: 'DEV resource, wounded-unit, and terminal HQ fixtures plus explicit simulation pauses are disclosed per case. This is not a full unassisted match, physical mobile GPU measurement, or a color-vision accessibility assessment.',
  },
  timeoutsMs: limits,
  cases: [],
};
let browser, serverOutput = '', stopReason = '', failedStartups = 0;
const suiteDeadline = Date.now() + limits.suite;
await mkdir(artifacts, { recursive: true });
// Console events can arrive during a stage write. Serialize atomic replacements
// so cancellation always leaves a complete, parseable last-known report.
let reportWrite = Promise.resolve();
const saveReport = () => {
  const snapshot = JSON.stringify(report, null, 2);
  reportWrite = reportWrite.catch(() => undefined).then(async () => {
    await writeFile(`${artifacts}/report.tmp`, snapshot);
    await rename(`${artifacts}/report.tmp`, `${artifacts}/report.json`);
  });
  return reportWrite;
};
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', chunk => { serverOutput += chunk; });
server.stderr.on('data', chunk => { serverOutput += chunk; });
server.on('error', error => { serverOutput += `\n${error.stack ?? error.message}`; });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const screenshot = (page, name, timeout = limits.screenshot) => page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true, animations: 'disabled', timeout });
const within = async (promise, ms, message) => {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    })]);
  } finally { clearTimeout(timer); }
};
const rendererError = result => [...result.consoleErrors, ...result.pageErrors].find(message =>
  /THREE\.BufferGeometryUtils:.*mergeGeometries|THREE\.WebGLProgram:.*Shader Error|(?:THREE\.WebGLRenderer|WebGL).*(?:Error creating|not supported|failed|context lost)/i.test(message));
class BattleStartupError extends Error {
  constructor(message, shared = false) { super(message); this.name = 'BattleStartupError'; this.shared = shared; }
}
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
async function waitForBattle(page, result) {
  const started = Date.now();
  const probe = { stage: result.stage, started: new Date().toISOString(), status: 'waiting' };
  result.startups.push(probe);
  try {
    while (Date.now() - started < limits.startup) {
      const fatal = rendererError(result);
      if (fatal) throw new BattleStartupError(`Renderer startup error: ${fatal}`, true);
      if (result.pageErrors.length) throw new BattleStartupError(`Uncaught startup error: ${result.pageErrors[0]}`);
      probe.snapshot = await within(page.evaluate(() => {
        const handle = window.__war, renderer = handle?.renderer;
        return { ui: Boolean(document.querySelector('.war-ui')),
          fallback: document.querySelector('.war-fallback')?.textContent ?? null,
          handle: Boolean(handle), time: handle?.world.time ?? null,
          calls: renderer?.info.render.calls ?? 0, triangles: renderer?.info.render.triangles ?? 0,
          contextLost: renderer ? renderer.getContext().isContextLost() : null };
      }), Math.min(5000, limits.startup - (Date.now() - started)), 'The browser stopped responding during WebGL startup');
      probe.elapsedMs = Date.now() - started;
      if (probe.snapshot.fallback !== null || probe.snapshot.contextLost) {
        throw new BattleStartupError(`WebGL unavailable: ${JSON.stringify(probe.snapshot)}`, true);
      }
      if (probe.snapshot.ui && probe.snapshot.calls > 0 && probe.snapshot.time >= .1) {
        await page.evaluate(() => {
          window.__war.skipDrop();
          document.querySelector('#adventure-strategy')?.click();
          window.__war.setPaused(true); window.__war.ui();
        });
        const gpu = await page.evaluate(() => {
          const renderer = window.__war.renderer, gl = renderer.getContext();
          return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
            geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
            contextLost: gl.isContextLost(), version: gl.getParameter(gl.VERSION) };
        });
        probe.status = 'ready'; probe.elapsedMs = Date.now() - started;
        await saveReport(); return gpu;
      }
      await sleep(150);
    }
    throw new BattleStartupError(`WebGL did not become ready within ${limits.startup}ms: ${JSON.stringify(probe.snapshot)}`);
  } catch (error) {
    probe.status = 'failed'; probe.elapsedMs = Date.now() - started;
    probe.error = String(error.message ?? error);
    if (error instanceof BattleStartupError) throw error;
    throw new BattleStartupError(probe.error, Boolean(rendererError(result)));
  }
}

async function grandFactionColors(page) {
  // Inspect the actual scene, rather than importing the intended palette. A
  // centered, visible instanced body part must give every living soldier a color
  // exclusive to its owner. Shared skin/metal materials cannot satisfy this.
  const armies = await page.evaluate(() => {
    const { scene, world } = window.__war;
    const units = world.units.filter(unit => unit.hp > 0 && world.factions[unit.owner].alive);
    const palette = new Map();
    scene.updateMatrixWorld(true);
    scene.traverseVisible(node => {
      if (!node.isInstancedMesh || !node.count || !node.material.color || node.material.visible === false || node.material.opacity === 0) return;
      const matrix = node.matrixWorld.clone();
      for (let i = 0; i < node.count; i++) {
        node.getMatrixAt(i, matrix); matrix.premultiply(node.matrixWorld);
        const x = matrix.elements[12], z = matrix.elements[14];
        const unit = units.find(candidate => Math.hypot(candidate.x - x, candidate.z - z) < .02);
        if (!unit) continue;
        const color = node.material.color.clone();
        if (node.instanceColor) { const tint = color.clone(); node.getColorAt(i, tint); color.multiply(tint); }
        const hex = color.getHexString();
        if (!palette.has(hex)) palette.set(hex, { owners: new Set(), ids: new Set() });
        const entry = palette.get(hex); entry.owners.add(unit.owner); entry.ids.add(unit.id);
      }
    });
    return [0, 1, 2, 3].map(owner => {
      const candidates = [...palette].filter(([, entry]) => entry.owners.size === 1 && entry.owners.has(owner))
        .sort((a, b) => b[1].ids.size - a[1].ids.size);
      return { owner, soldiers: units.filter(unit => unit.owner === owner).length,
        color: candidates[0]?.[0] ?? null, coloredInstances: candidates[0]?.[1].ids.size ?? 0 };
    });
  });
  for (const army of armies) assert.equal(army.coloredInstances, army.soldiers, `Faction ${army.owner} lacks a distinct colored instance for every soldier`);
  assert.equal(new Set(armies.map(army => army.color)).size, 4, 'Grand armies need four distinct faction colors');
  let minimumRgbDistance = Infinity;
  for (let i = 0; i < armies.length; i++) for (let j = i + 1; j < armies.length; j++) {
    const rgb = hex => hex.match(/../g).map(channel => Number.parseInt(channel, 16));
    const a = rgb(armies[i].color), b = rgb(armies[j].color);
    minimumRgbDistance = Math.min(minimumRgbDistance, Math.hypot(...a.map((channel, index) => channel - b[index])));
  }
  assert.ok(minimumRgbDistance >= 50, `Faction uniform colors are too similar: RGB distance ${minimumRgbDistance}`);
  return { armies, minimumRgbDistance, method: 'Visible GPU instance positions and material colors; rendered battle screenshots accompany this structural check' };
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
    if (!stopReason && Date.now() >= suiteDeadline) stopReason = `Suite exceeded its ${limits.suite}ms budget`;
    if (stopReason) {
      report.cases.push({ name, mapId: map.id, grandBattle: grand, viewport, status: 'blocked', reason: stopReason });
      process.exitCode = 1; await saveReport(); continue;
    }
    const context = await browser.newContext({ viewport, isMobile: viewport.width < 900, hasTouch: viewport.width < 900, reducedMotion: 'reduce' });
    const page = await context.newPage(); page.setDefaultTimeout(limits.action); page.setDefaultNavigationTimeout(20000);
    const caseStarted = Date.now();
    const result = { name, mapId: map.id, grandBattle: grand, viewport, status: 'running', stage: 'menu',
      started: new Date().toISOString(), stages: [], startups: [], diagnostics: [], pageErrors: [], consoleErrors: [],
      fixtures: ['DEV freeze after startup, resumed around each real action', 'DEV skip parachute after the real 3D scene has rendered'] };
    report.cases.push(result);
    const stage = async value => {
      const now = Date.now(), previous = result.stages.at(-1);
      if (previous) previous.durationMs = now - previous.startedMs;
      result.stage = value;
      result.stages.push({ name: value, at: new Date(now).toISOString(), startedMs: now, elapsedMs: now - caseStarted });
      console.log(`FRONTIERS ${name} +${now - caseStarted}ms: ${value}`); await saveReport();
    };
    const diagnostic = (type, message, details = {}) => {
      if (result.diagnostics.length >= 100) { result.suppressedDiagnostics = (result.suppressedDiagnostics ?? 0) + 1; return; }
      result.diagnostics.push({ type, message, stage: result.stage, at: new Date().toISOString(), elapsedMs: Date.now() - caseStarted, ...details });
      if (type === 'pageerror') result.pageErrors.push(message);
      if (type === 'consoleerror') result.consoleErrors.push(message);
      console.error(`BROWSER ${name} [${result.stage}] ${type}: ${message}`);
      void saveReport().catch(error => console.error(`Could not persist browser diagnostic: ${error.message}`));
    };
    page.on('pageerror', error => diagnostic('pageerror', error.message, { stack: error.stack }));
    page.on('console', message => { if (message.type() === 'error') diagnostic('consoleerror', message.text(), { location: message.location() }); });
    page.on('crash', () => diagnostic('pageerror', 'Chromium page crashed'));
    const caseBudget = Math.min(limits.scenario, suiteDeadline - Date.now());
    const caseTimer = setTimeout(() => {
      result.timeout = { stage: result.stage, budgetMs: caseBudget, elapsedMs: Date.now() - caseStarted };
      console.error(`TIMEOUT ${name} [${result.stage}] after ${caseBudget}ms`);
      void saveReport().then(() => context.close()).catch(error => console.error(`Timeout cleanup: ${error.message}`));
    }, caseBudget);
    try {
      await stage('menu and preferences');
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
      if (viewport.width < 900) {
        await page.locator('#records').click(); await page.locator('.records-dialog').waitFor();
        result.emptyRecordsBounds = await assertInside(page, '.records-dialog');
        assert.equal(await page.locator('[data-expedition-record]').count(), 0);
        await page.locator('#records-tab-achievements').click();
        assert.equal(await page.locator('[data-achievement]').count(), 8);
        await screenshot(page, `${name}-empty-records`);
        await page.keyboard.press('Escape'); await page.locator('.records-dialog').waitFor({ state: 'hidden' });
      }
      await screenshot(page, `${name}-menu`);
      await stage('initial WebGL startup');
      await page.locator(grand ? '#start-grand' : '#start-war').click();
      result.gpu = await waitForBattle(page, result);
      assert.ok(result.gpu.calls > 0 && result.gpu.triangles > 0 && !result.gpu.contextLost);
      await stage('map geometry and faction armies');
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
      if (grand) result.factionColors = await grandFactionColors(page);
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
      await stage('resume WebGL startup');
      await page.locator('#continue-war').click();
      await waitForBattle(page, result);
      await stage('resumed contracts, cooldowns, and squad orders');
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
        await stage('simulation victory and archive creation');
        result.fixtures.push('DEV set enemy HQ HP to zero; the real running simulation eliminates them, decides victory, and invokes result/archive handling. This is a seeded result, not an unassisted win.');
        await page.evaluate(() => {
          for (const faction of window.__war.world.factions.slice(1)) faction.hp = 0;
          window.__war.setPaused(false);
        });
        await page.locator('.result-panel').waitFor();
        result.terminal = await page.evaluate(() => {
          const { world } = window.__war;
          return { over: world.over, winner: world.winner, alive: world.factions.map(faction => faction.alive),
            archive: JSON.parse(localStorage.getItem('waldo.expeditions.v1')) };
        });
        assert.equal(result.terminal.over, true); assert.equal(result.terminal.winner, 0);
        assert.deepEqual(result.terminal.alive, [true, false, false, false]);
        assert.equal(result.terminal.archive.records.length, 1);
        const recorded = result.terminal.archive.records[0];
        assert.equal(recorded.mapId, map.id); assert.equal(recorded.grandBattle, true);
        assert.equal(recorded.victory, true); assert.equal(recorded.supportUses, 3);
        assert.equal(recorded.contractsCompleted, 1);
        await screenshot(page, `${name}-victory`);
        await stage('retry WebGL startup');
        await page.locator('#again').click(); await waitForBattle(page, result);
        await stage('same-map retry and recorded victory dialog');
        const retry = await state(page);
        assert.equal(retry.mapId, 'continental'); assert.equal(retry.grandBattle, true);
        assert.deepEqual(retry.operations.claimed, []);
        assert.equal(retry.operations.supportUses, 0);
        await page.locator('#exit').click(); await page.locator('#records').click();
        await page.locator('.records-dialog').waitFor();
        result.completedRecordsBounds = await assertInside(page, '.records-dialog');
        assert.equal(await page.locator('[data-expedition-record]').count(), 1, 'The real result handler must create exactly one archive entry');
        assert.equal(await page.locator('.record-victory').count(), 1);
        assert.equal(await page.locator('.record-location h3').innerText(), map.title);
        await screenshot(page, `${name}-recorded-victory`);
        await page.locator('#records-tab-achievements').click();
        assert.equal(await page.locator('[data-achievement="grand-victory"].achievement-unlocked').count(), 1);
        await screenshot(page, `${name}-earned-achievements`);
        await page.keyboard.press('Escape');
        await page.locator('.records-dialog').waitFor({ state: 'hidden' });
        assert.ok(await page.locator('#records').evaluate(element => element === document.activeElement));
      }
      assert.deepEqual(result.pageErrors, [], 'Uncaught browser errors');
      assert.deepEqual(result.consoleErrors, [], 'Browser console errors');
      result.status = 'passed'; failedStartups = 0;
      console.log(`PASS ${name}: ${map.size}×${map.size}, ${map.posts} posts, real support/contract/atlas/save controls`);
    } catch (error) {
      result.status = 'failed'; result.error = String(error.stack ?? error); result.failedStage = result.stage; process.exitCode = 1;
      if (error instanceof BattleStartupError) failedStartups++; else failedStartups = 0;
      const shared = rendererError(result);
      if (shared || error.shared) stopReason = `Shared renderer startup failure in ${name}: ${shared ?? error.message}`;
      else if (failedStartups >= 2) stopReason = `Two consecutive WebGL startup failures; latest case ${name}: ${error.message}`;
      result.failurePage = await within(page.evaluate(() => ({ url: location.href, title: document.title,
        text: document.body.innerText.slice(-2500), warUI: Boolean(document.querySelector('.war-ui')),
        warHandle: Boolean(window.__war), canvasCount: document.querySelectorAll('canvas').length })),
      2000, 'Failure DOM snapshot timed out').catch(snapshotError => ({ error: snapshotError.message }));
      await screenshot(page, `${name}-failure`, 3000).catch(screenshotError => { result.failureScreenshotError = screenshotError.message; });
      console.error(`FAIL ${name}: ${result.error}`);
    } finally {
      clearTimeout(caseTimer);
      result.finished = new Date().toISOString(); result.elapsedMs = Date.now() - caseStarted;
      if (result.stages.length) result.stages.at(-1).durationMs = Date.now() - result.stages.at(-1).startedMs;
      await saveReport();
      await within(context.close(), 5000, 'Browser context cleanup timed out').catch(error => { result.cleanupError = error.message; });
    }
  }
} catch (error) {
  report.error = String(error.stack ?? error); process.exitCode = 1; console.error(report.error);
} finally {
  report.finished = new Date().toISOString();
  report.summary = Object.fromEntries(['passed', 'failed', 'blocked'].map(status => [status, report.cases.filter(item => item.status === status).length]));
  if (stopReason) report.stopReason = stopReason;
  await saveReport(); await writeFile(`${artifacts}/vite.log`, serverOutput);
  await browser?.close().catch(() => undefined);
  server.kill('SIGTERM');
}
