import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const port = 4181, origin = `http://127.0.0.1:${port}`, artifacts = 'browser-artifacts';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
let output = '', browser;
server.stdout.on('data', data => { output += data; }); server.stderr.on('data', data => { output += data; });
const requestedWidth = Number(process.env.ECONOMY_WIDTH) || 0;
const report = { scenario: 'Real UI commands with funded resources, simulated clock advances, and explicitly seeded territory/victory fixtures.', cases: [] };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(output);
    if (await fetch(origin).then(r => r.ok).catch(() => false)) break;
    await sleep(100);
  }
  await mkdir(artifacts, { recursive: true });
  browser = await chromium.launch({ args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 780 }].filter(v => !requestedWidth || v.width === requestedWidth)) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(() => { if (!localStorage.getItem('waldo.preferences.v1')) localStorage.setItem('waldo.preferences.v1', JSON.stringify({ quality: 'low', sound: false, reducedMotion: true })); });
    const page = await context.newPage(); const errors = [];
    page.setDefaultTimeout(30000);
    console.log(`STAGE economy ${viewport.width}: startup`);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.locator('#start-war').click();
    await page.waitForFunction(() => window.__war?.renderer.info.render.calls > 0);
    assert.equal(await page.locator('.adventure-active').count(), 0, 'Management must start in strategy view');
    await page.evaluate(() => {
      const { world, setPaused, ui } = window.__war; setPaused(true);
      world.factions[0].gold = 1000; world.factions[0].food = 1000;
      world.factions.slice(1).forEach(f => { f.aiTimer = 99999; }); ui();
    });
    const advance = async seconds => page.evaluate(async amount => {
      const { stepWar } = await import('/src/battle/war.ts');
      for (let i = 0; i < Math.round(amount * 10); i++) stepWar(window.__war.world, .1);
      window.__war.ui();
    }, seconds);
    const state = () => page.evaluate(() => structuredClone(window.__war.world.economy[0]));
    console.log(`STAGE economy ${viewport.width}: production and construction`);
    await page.locator('#worker-minus-farm').click(); await page.locator('#worker-plus-mine').click();
    assert.equal((await state()).workers.mine, 7);
    await page.locator('#tab-city').click();
    await page.locator('#civil-build-market').click(); assert.equal((await state()).market, 0);
    await advance(20); assert.equal((await state()).market, 1);
    await page.locator('#civil-build-city').click(); await advance(25); assert.equal((await state()).city, 2);
    await page.locator('#civil-build-port').click(); await advance(30); assert.equal((await state()).port, 1);
    await page.locator('#tab-economy').click();
    await page.locator('#worker-minus-mine').click(); await page.locator('#worker-plus-trade').click();
    await page.locator('#recruit-worker').click(); await page.locator('#worker-plus-farm').click();
    assert.equal((await state()).workers.farm, 6);
    await page.locator('#tab-city').click(); await page.locator('#tax-high').click(); await page.locator('#tab-economy').click();
    await page.locator('#home').click();
    await page.locator('.war-panel-scroll').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: `${artifacts}/economy-${viewport.width}.png` });
    console.log(`STAGE economy ${viewport.width}: exports and contracts`);
    await page.locator('#tab-trade').click(); assert.equal(await page.locator('#export-overseas').isDisabled(), true);
    await page.evaluate(() => { window.__war.world.outposts[3].owner = 0; window.__war.ui(); });
    await page.locator('#export-overseas').click(); await advance(10);
    const remaining = (await state()).shipment.remaining;
    await page.evaluate(() => { window.__war.world.outposts[3].owner = null; }); await advance(5);
    assert.equal((await state()).shipment.remaining, remaining);
    await page.evaluate(() => { window.__war.world.outposts[3].owner = 0; }); await advance(25);
    assert.equal((await state()).exports, 1);
    await page.locator('#contract-provisions').click();
    await page.locator('#active-contract').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${artifacts}/contract-${viewport.width}.png` });
    await page.locator('#fulfill-contract').click(); assert.equal((await state()).completed, 1);
    await page.locator('#save').click();
    console.log(`STAGE economy ${viewport.width}: persistence and victory`);
    const saved = await state();
    const menuBox = await page.locator('#exit').boundingBox();
    assert.ok(menuBox && menuBox.width >= 18, 'Menu must retain a clickable width after four-digit trade income');
    const topButtons = await page.locator('.war-top button').evaluateAll(nodes => nodes.filter(node => getComputedStyle(node).display !== 'none').map(node => { const r = node.getBoundingClientRect(); return {id:node.id,left:r.left,right:r.right,top:r.top,bottom:r.bottom}; }));
    for(const [i,a] of topButtons.entries())for(const b of topButtons.slice(i+1))assert.ok(Math.min(a.right,b.right)<=Math.max(a.left,b.left)||Math.min(a.bottom,b.bottom)<=Math.max(a.top,b.top), `${a.id} overlaps ${b.id}`);
    await page.locator('#exit').click();
    await page.locator('#continue-war').click(); await page.waitForFunction(() => Boolean(window.__war));
    await page.evaluate(() => window.__war.setPaused(true));
    const resumed = await state(); assert.equal(resumed.completed, saved.completed); assert.equal(resumed.workers.trade, 1);
    await page.locator('#tab-trade').click();
    const overflow = await page.evaluate(() => ({ page: document.documentElement.scrollWidth > innerWidth, pane: document.querySelector('#pane-trade').scrollWidth > document.querySelector('#pane-trade').clientWidth + 1 }));
    assert.deepEqual(overflow, { page: false, pane: false });
    await page.locator('.war-panel-scroll').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: `${artifacts}/trade-${viewport.width}.png` });
    await page.evaluate(() => {
      const w = window.__war.world, e = w.economy[0]; e.city = 4; e.completed = 3; e.reputation = 80;
      w.outposts.slice(0, 3).forEach(p => { p.owner = 0; });
    });
    await advance(.1); await page.waitForSelector('.war-end:not([hidden])');
    assert.equal(await page.locator('#result-title').innerText(), '교역 제국의 탄생');
    await page.screenshot({ path: `${artifacts}/economic-victory-${viewport.width}.png` });
    await page.locator('#again').click(); await page.waitForFunction(() => window.__war?.world.time < 2);
    assert.equal(await page.evaluate(() => window.__war.world.economyCampaign), true);
    assert.deepEqual(errors, []);
    report.cases.push({ viewport, passed: true, savedContract: resumed.completed, resumedMerchants: resumed.workers.trade });
    await context.close(); console.log(`PASS economy ${viewport.width}×${viewport.height}`);
  }
} catch (error) {
  report.error = String(error.stack ?? error); process.exitCode = 1; console.error(report.error);
} finally {
  await browser?.close(); server.kill('SIGTERM');
  await writeFile(`${artifacts}/economy-report${requestedWidth ? "-" + requestedWidth : ""}.json`, JSON.stringify(report, null, 2));
}
