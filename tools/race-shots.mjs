// SPEED RUSH 차량·연출 스크린샷(개발용): node tools/race-shots.mjs [출력폴더]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'browser-artifacts/race', port = 5199, origin = `http://127.0.0.1:${port}/`;
mkdirSync(out, { recursive: true });
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 80; i++) { try { if ((await fetch(origin)).ok) break; } catch { /* wait */ } await sleep(250); }
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const [map, car, skin, tag, mode] of [['dusk', 'nova', 'stock', 'dusk-nova'], ['sunset', 'rally', 'neon', 'sunset-rally'], ['dusk', 'arc', 'stock', 'dusk-arc'], ['alpine', 'velox', 'pearl', 'alpine-velox'], ['sunset', 'nova', 'stock', 'trial-nova', 'trial']]) {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    await page.addInitScript(([m, c, s, md]) => { localStorage.setItem('waldo.race.setup.v1', JSON.stringify({ map: m, laps: 1, level: 1, car: c, skin: s, mode: md || 'race' })); localStorage.setItem('waldo.race.garage.v1', JSON.stringify({ coins: 0, cars: {}, skins: ['neon', 'pearl'] })); }, [map, car, skin, mode]);
    await page.goto(origin); await page.locator('#start-race').click(); await page.locator('.rc-setup').waitFor();
    if (tag === 'dusk-nova') await page.screenshot({ path: `${out}/setup.png` });
    await page.locator('[data-setup="start"]').click();
    await page.waitForFunction(() => document.querySelector('.rc-root')?.dataset.phase === 'countdown');
    await page.evaluate(() => { window.__race.dbg.auto = true; window.__race.skip(3.2 + 9); });
    await sleep(900);
    await page.screenshot({ path: `${out}/${tag}.png` });
    await page.close();
  }
} finally { await browser.close(); server.kill(); }
