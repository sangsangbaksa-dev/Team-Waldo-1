// LAST CITY 건물 LOD 배율별 비용·화면: `node tools/perf-city-lod.mjs [배율,배율…] [출력폴더]` (기본 1,0.6,0.4). 소프트웨어 GL 이라 전후 비교용.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const scales = (process.argv[2] || '1,0.6,0.4').split(',').map(Number), out = process.argv[3] || '', port = 5700 + Math.floor(Math.random() * 200), origin = `http://127.0.0.1:${port}/`;
if (out) mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms)), road = i => i * 560 + 60;
for (let i = 0; i < 120; i++) { try { if ((await fetch(origin)).ok) break; } catch { /* wait */ } await sleep(250); }
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  await ctx.addInitScript(() => localStorage.setItem('waldo.preferences.v1', JSON.stringify({ sound: false, quality: 'high', reducedMotion: false })));
  const page = await ctx.newPage(); page.setDefaultTimeout(120000);
  page.on('console', m => { if (/error|fail/i.test(m.text())) console.log('C', m.text().slice(0, 160)); }); page.on('pageerror', e => console.log('E', String(e).slice(0, 200))); await page.goto(origin); await page.locator('#start-city').click(); await page.locator('.c-setup').waitFor(); await page.locator('[data-act="class:warlord"]').click(); await page.locator('.city-hud').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !!window.__city?.r3); await sleep(1500);
  for (const [name, x, z, yaw] of [['street', road(4), road(2) + 700, -Math.PI / 2], ['junction', road(3) + 60, road(3) + 80, -Math.PI / 4], ['avenue', road(5), road(4) + 20, Math.PI / 2]]) {
    await page.evaluate(([x, z, yaw]) => { const c = window.__city, w = c.world, b = w.boss(0), r3 = c.r3; r3.adaptive = false; b.x = x; b.y = z; r3.yaw = yaw; r3.pitch = 0.02; r3.mode = 'fp'; w.hour = 10; w.weather = 'clear'; r3.snapAtmosphere(); }, [x, z, yaw]);
    for (const s of scales) {
      await page.evaluate(async s => { const r3 = window.__city.r3; if (r3.bfx.lod) r3.bfx.lod.scale = s; for (let i = 0; i < 3; i++) { r3.draw(0.016, null); await new Promise(r => setTimeout(r, 30)); } }, s);
      const r = await page.evaluate(() => { const r3 = window.__city.r3, R = r3.renderer, info = R.info; info.autoReset = false; info.reset(); R.shadowMap.needsUpdate = true; r3.draw(0.016, null); const o = { calls: info.render.calls, trisK: Math.round(info.render.triangles / 1000), lod: r3.bfx.lod?.counts() }; info.autoReset = true; return o; });
      console.log(`${name} scale=${s}`, JSON.stringify(r)); if (out) await page.screenshot({ path: `${out}/${name}-${s}.png` });
    }
  }
} finally { await browser.close(); server.kill(); }
