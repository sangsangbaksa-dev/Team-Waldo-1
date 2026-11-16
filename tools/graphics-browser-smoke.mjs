import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const port = 4188, origin = `http://127.0.0.1:${port}`, artifacts = 'browser-artifacts/graphics';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
let output = '', browser;
server.stdout.on('data', data => { output += data; }); server.stderr.on('data', data => { output += data; });
server.on('error', error => { output += error.stack; });
const report = { commit: process.env.GITHUB_SHA ?? 'local', cases: [] };
const selected = process.env.GRAPHICS_CASE ?? 'all';
const errors = [];
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function state(page) {
  await frame(page);
  return page.evaluate(() => {
    const { renderer, scene, camera } = window.__war;
    const terrain = scene.getObjectByName('Textured meadow terrain');
    const labels = []; scene.traverse(object => { if (object.isSprite) labels.push(object.layers.mask); });
    return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures,
      shadows: renderer.shadowMap.enabled, contextLost: renderer.getContext().isContextLost(),
      programs: renderer.info.programs.map(program => program.name), terrain: terrain.material.map.name,
      relief: Boolean(terrain.material.bumpMap), labels, cameraLayers: camera.layers.mask,
      width: innerWidth, pageWidth: document.documentElement.scrollWidth };
  });
}
try {
  await mkdir(artifacts, { recursive: true });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(origin)).ok) break; } catch { /* server starting */ }
    if (i === 99) throw new Error(output || 'Vite did not start');
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  browser = await chromium.launch({ args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  if (selected !== 'grand') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => localStorage.setItem('waldo.preferences.v1', JSON.stringify({ quality: 'low', sound: false, reducedMotion: true })));
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(origin); await page.locator('#start-war').click();
  await page.waitForFunction(() => window.__war?.renderer.info.render.calls > 0);
  await page.evaluate(() => { window.__war.setPaused(true); document.querySelector('#home').click(); });
  const low = await state(page);
  assert.equal(low.contextLost, false); assert.equal(low.relief, false);
  assert.equal(low.terrain, 'Grass, gravel and earth grain');
  assert.ok(low.labels.length >= 13 && low.labels.every(mask => mask === 2));
  assert.ok((low.cameraLayers & 3) === 3, 'All terrain and label layers must be restored after rendering');
  await page.locator('#settings').click();
  const samples = { low };
  for (const quality of ['standard', 'high', 'low']) {
    await page.locator('#graphics-setting').selectOption(quality);
    const sample = await state(page); samples[quality] = sample;
    assert.equal(sample.shadows, quality === 'high'); assert.equal(sample.relief, quality === 'high');
    assert.equal(sample.cameraLayers, low.cameraLayers, 'A postprocess frame must not hide labels in the next frame');
    if (quality !== 'low') assert.ok(sample.programs.includes('FXAAShader'), 'AA must compile after launching in low quality');
  }
  assert.equal(samples.standard.calls, low.calls + 2, 'Standard quality must execute the two screen passes');
  assert.equal(samples.low.calls, low.calls, 'Low quality must bypass postprocessing');
  await page.locator('#graphics-setting').selectOption('standard'); await page.keyboard.press('Escape');
  await page.evaluate(() => { window.__war.setPaused(true); }); await frame(page);
  await page.screenshot({ path: `${artifacts}/desktop.png`, timeout: 60000 });
  report.cases.push({ name: 'low-to-high-and-back', passed: true, samples });
  await page.setViewportSize({ width: 320, height: 780 }); await frame(page);
  const mobile = await state(page); assert.ok(mobile.pageWidth <= 320); assert.equal(mobile.contextLost, false);
  const buffer = await page.evaluate(() => { const r = window.__war.renderer; const c = r.domElement; return { width: c.width, height: c.height, ratio: r.getPixelRatio() }; });
  assert.equal(buffer.width, Math.floor(320 * buffer.ratio));
  await page.screenshot({ path: `${artifacts}/mobile.png`, timeout: 60000 });
  assert.deepEqual(errors, []);
  report.cases.push({ name: 'mobile-resize-and-labels', passed: true, mobile });
  await page.locator('#save').click(); await page.locator('#exit').click(); await page.locator('#continue-war').click();
  await page.waitForFunction(() => window.__war?.renderer.info.render.calls > 0);
  assert.equal((await state(page)).contextLost, false);
  await context.close();
  }

  if (selected !== 'desktop') {
  const grandContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await grandContext.addInitScript(() => localStorage.setItem('waldo.preferences.v1', JSON.stringify({ quality: 'low', sound: false, reducedMotion: true })));
  const grandPage = await grandContext.newPage(); grandPage.setDefaultTimeout(60000);
  grandPage.on('pageerror', error => errors.push(error.message));
  grandPage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await grandPage.goto(origin); await grandPage.locator('#mode-conquest').click(); await grandPage.locator('#start-war').click();
  await grandPage.waitForFunction(() => window.__war?.renderer.info.render.calls > 0);
  await grandPage.evaluate(() => { document.querySelector('#home').click(); window.__war.setPaused(true); });
  await frame(grandPage);
  const grand = await grandPage.evaluate(() => { const h = window.__war; return { units: h.world.units.length, shadows: h.scene.getObjectByName('Army contact shadows').count, calls: h.renderer.info.render.calls }; });
  assert.equal(grand.units, 600); assert.equal(grand.shadows, 600); assert.ok(grand.calls < 1500);
  await grandPage.screenshot({ path: `${artifacts}/grand.png`, timeout: 60000 });
  // A larger army must reuse the same batches, rather than add draws per soldier.
  await grandPage.evaluate(() => {
    const w = window.__war.world;
    w.units.push(...w.units.slice(0, 100).map(unit => ({ ...unit, id: w.nextUnit++, x: unit.x + 1 })));
  });
  await frame(grandPage);
  const expandedCalls = await grandPage.evaluate(() => window.__war.renderer.info.render.calls);
  assert.equal(expandedCalls, grand.calls, 'Adding 100 soldiers must not add draw calls');
  assert.deepEqual(errors, []); report.cases.push({ name: '600-soldier-contact-shadows', passed: true, grand });
  await grandContext.close();
  }
  console.log('PASS graphics: ' + report.cases.map(item => item.name).join(', '));
} catch (error) {
  report.error = error.stack; process.exitCode = 1; console.error(error);
} finally {
  await browser?.close(); server.kill('SIGTERM');
  await writeFile(`${artifacts}/report${selected === 'all' ? '' : '-' + selected}.json`, JSON.stringify(report, null, 2));
}
