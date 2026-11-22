import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Standalone real-browser regression: main page, SPEED RUSH entry, and Last City's mission UI.
const port = 4187;
const origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
for (const stream of [server.stdout, server.stderr]) stream.on('data', data => { serverLog += data; });
server.on('error', error => { serverLog += '\n' + error.message; });

const sizes = [{ name: 'desktop', width: 1280, height: 800, quality: 'standard', map: 'storm' }, { name: 'mobile', width: 390, height: 844, quality: 'low', map: 'desert' }];
const results = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
await mkdir('browser-artifacts', { recursive: true });
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) break;
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* Wait for Vite. */ }
    await sleep(250);
  }
  assert.ok(ready, 'Last City Vite server did not start: ' + serverLog);

  browser = await chromium.launch({
    headless: true, executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });
  for (const size of sizes) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      isMobile: size.name === 'mobile', hasTouch: size.name === 'mobile', reducedMotion: 'reduce',
    });
    await context.addInitScript(quality => {
      localStorage.setItem('waldo.preferences.v1', JSON.stringify({ sound: false, quality, reducedMotion: true }));
    },size.quality);
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await page.locator('.tile').first().waitFor();
      const entries = await page.locator('.tile').evaluateAll(tiles => tiles.map(tile => tile.dataset.game));
      // Keep checking the baseline games, but allow new games to join the catalog.
      for (const id of ['city', 'outlaw', 'race', 'rts', 'shooter', 'tycoon']) assert.ok(entries.includes(id), 'Missing arcade game: ' + id);
      assert.equal(entries[0], 'city', 'LAST CITY must be the first game');
      assert.equal(entries[1], 'race', 'SPEED RUSH must be the second game');
      assert.equal(new Set(entries).size, entries.length, 'Game IDs must be unique');
      await page.screenshot({ path: 'browser-artifacts/last-city-home-' + size.name + '.png', animations: 'disabled' });
      await page.locator('#start-race').click();
      await page.locator('.rc-root').waitFor({ state: 'visible' });
      await page.locator('.rc-setup').waitFor();
      assert.equal(await page.locator('[data-pick^="map:"]').count(), 7, 'Race setup must list seven maps');
      assert.equal(await page.locator('[data-pick^="car:"]').count(), 8, 'Race setup must list eight cars');
      await page.screenshot({ path: 'browser-artifacts/race-setup-' + size.name + '.png', animations: 'disabled' });
      await page.locator('[data-pick="map:' + size.map + '"]').click();
      await page.locator('[data-pick="laps:1"]').click();
      await page.locator('[data-pick="level:2"]').click();
      await page.locator('[data-pick="car:velox"]').click();
      await page.locator('[data-setup="start"]').click();
      await page.waitForFunction(() => document.querySelector('.rc-root')?.dataset.phase === 'countdown');
      assert.equal(await page.locator('#rc-laps').innerText(), '1', 'HUD must show the chosen lap count');
      await page.waitForFunction(()=>window.__race?.view?.renderer?.info?.render?.calls>0);
      const raceStart=await page.evaluate(()=>({calls:window.__race.view.renderer.info.render.calls,triangles:window.__race.view.renderer.info.render.triangles}));
      assert.ok(raceStart.calls>0 && raceStart.triangles>0,'SPEED RUSH must submit actual 3D geometry');
      await page.screenshot({path:'browser-artifacts/last-city-race-'+size.name+'.png',animations:'disabled'});
      await page.evaluate(()=>{window.__race.dbg.auto=true;window.__race.skip(6);});
      await page.waitForFunction(()=>window.__race.race.clock>0 && Math.abs(window.__race.race.player.car.vf)>3);
      await page.screenshot({path:'browser-artifacts/last-city-race-driving-'+size.name+'.png',animations:'disabled'});
      await page.locator('.rc-btns [data-act="exit"]').click();
      await page.locator('.tile').first().waitFor();
      await page.locator('#start-city').click();
      await page.locator('.c-setup').waitFor();
      await page.locator('[data-act="class:warlord"]').click();
      await page.locator('.city-hud').waitFor({ state: 'visible' });
      await page.waitForFunction(() => !!window.__city?.world);
      assert.ok(await page.evaluate(()=>!!window.__city.r3),'LAST CITY must not silently fall back to 2D');
      await page.waitForFunction(()=>window.__city.r3.renderer.info.render.calls>0);
      if(size.name==='desktop'){
        // Exercise the standard-quality nighttime / wet-road render path.
        await page.evaluate(()=>{const {world,r3}=window.__city;world.hour=23;world.weather='rain';r3?.snapAtmosphere();});
        await page.screenshot({path:'browser-artifacts/last-city-night-'+size.name+'.png',animations:'disabled'});
        const entered=await page.evaluate(()=>{const w=window.__city.world,z=w.businesses.find(b=>b.kind==='bank'&&(b.owner<0||b.owner===0));return !!z&&!w.enterBiz(0,z);});
        assert.ok(entered,'Bank interior should be enterable');
        await page.waitForFunction(()=>!!window.__city.r3.ins && window.__city.r3.ins.scene.children.length>0);
        await page.screenshot({path:'browser-artifacts/last-city-bank-'+size.name+'.png',animations:'disabled'});
        await page.evaluate(()=>window.__city.world.exitBiz(0));
        await page.waitForFunction(()=>!window.__city.r3.ins);
      }
      if (size.name === 'desktop') await page.keyboard.press('j');
      else await page.locator('.c-topbtns [data-act="missions"]').click();
      await page.locator('.c-missions').waitFor({ state: 'visible' });
      assert.equal(await page.locator('.c-mission-card').count(), 8, 'Eight mission cards must render');
      assert.match(await page.locator('.c-mission-card.active h3').innerText(), /첫 수익원 확보/);
      assert.equal(await page.locator('.c-mission-summary strong').innerText(), '0 / 8');
      const box = await page.locator('.c-missions').boundingBox();
      assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= size.width + 1 &&
        box.y + box.height <= size.height + 1, 'Mission board must fit viewport');
      if (size.name === 'mobile') {
        const touch = await page.locator('.c-mission-list').evaluate(el => getComputedStyle(el).touchAction);
        assert.equal(touch, 'pan-y', 'Journal should support vertical swipe scrolling');
      }
      await page.screenshot({ path: 'browser-artifacts/last-city-missions-' + size.name + '.png', animations: 'disabled' });
      // Match-feed contents are untrusted network-derived strings: never render them as HTML.
      await page.evaluate(() => { window.__city.world.say('<img src=x onerror=window.__cityInjected=true> & CHECK', '#ff5d5d'); });
      await page.waitForFunction(() => document.querySelector('#c-feed')?.textContent?.includes('<img src=x'));
      assert.equal(await page.locator('#c-feed img').count(), 0, 'HTML inside match feed must remain escaped text');
      assert.equal(await page.evaluate(() => window.__cityInjected), undefined, 'No script execution from match feed');
      await page.evaluate(() => {
        window.__city.world.quests[0].done = true;
      });
      await page.waitForFunction(() => document.querySelector('.c-mission-summary strong')?.textContent.includes('1'));
      assert.equal(await page.locator('.c-mission-card.complete').count(), 1, 'Mission completion should show a checked card');
      assert.match(await page.locator('.c-mission-card.active h3').innerText(), /병영 가동/);
      if (size.name === 'desktop') await page.keyboard.press('j');
      else await page.locator('[data-act="closemissions"]').click();
      await page.locator('.c-missions').waitFor({ state: 'hidden' });
      // Verify that opening pause does not continuously submit costly 3D frames.
      await page.evaluate(() => {
        const r3=window.__city.r3;
        const original=r3.draw.bind(r3);
        let count=0;
        r3.draw=(...args)=>{count++;return original(...args);};
        window.__cityDrawCount=()=>count;
      });
      await page.locator('.c-topbtns [data-act="pause"]').click();
      await page.locator('.c-pause').waitFor({state:'visible'});
      await page.waitForTimeout(180);
      const pausedDraws=await page.evaluate(()=>window.__cityDrawCount());
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(()=>window.__cityDrawCount()),pausedDraws,'Paused 3D scene must remain static');
      await page.locator('.c-pause [data-act="resume"]').click();
      await page.waitForFunction(()=>window.__cityDrawCount()>0);
      await page.waitForTimeout(120);
      assert.ok(await page.evaluate(()=>window.__cityDrawCount())>pausedDraws,'Resume must restore WebGL drawing');
      assert.deepEqual(errors, [], 'Unexpected browser errors');
      results.push({ ...size, status: 'passed', cards: 8, raceStart });
      console.log('PASS Last City mission UI: ' + size.name);
    } catch (error) {
      results.push({ ...size, status: 'failed', error: String(error.stack ?? error), pageErrors: errors });
      process.exitCode = 1;
      await page.screenshot({ path: 'browser-artifacts/last-city-failure-' + size.name + '.png' }).catch(() => undefined);
      console.error('FAIL Last City mission UI: ' + size.name, error);
    } finally {
      await context.close();
    }
  }
} catch (error) {
  process.exitCode = 1;
  console.error(error);
  results.push({ status: 'failed', error: String(error.stack ?? error) });
} finally {
  await writeFile('browser-artifacts/last-city-missions.json', JSON.stringify(results, null, 2));
  await browser?.close().catch(() => undefined);
  server.kill('SIGTERM');
}
