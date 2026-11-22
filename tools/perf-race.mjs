// SPEED RUSH 성능 측정: 맵별로 프레임당 draw call·삼각형·CPU 시간. `node tools/perf-race.mjs [맵,맵…]` (cwd 의 저장소 기준; 소프트웨어 GL 이라 절대 fps 가 아니라 전후 비교용)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const maps = (process.argv[2] || 'sunset,alpine,desert,harbor,dusk').split(','), port = 5300 + Math.floor(Math.random() * 200), origin = `http://127.0.0.1:${port}/`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 120; i++) { try { if ((await fetch(origin)).ok) break; } catch { /* wait */ } await sleep(250); }
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const map of maps) {
    const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage(); page.setDefaultTimeout(90000);
    await page.addInitScript(m => { localStorage.setItem('waldo.race.setup.v1', JSON.stringify({ map: m, laps: 1, level: 1, car: 'nova', skin: 'stock', mode: 'race' })); localStorage.setItem('waldo.preferences.v1', JSON.stringify({ sound: false, quality: 'high', reducedMotion: false })); }, map);
    await page.goto(origin); await page.locator('#start-race').click(); await page.locator('.rc-setup').waitFor(); await page.locator('[data-setup="start"]').click();
    await page.waitForFunction(() => ['countdown', 'racing'].includes(document.querySelector('.rc-root')?.dataset.phase));
    await page.evaluate(() => { window.__race.dbg.auto = true; window.__race.skip(14); });
    await sleep(1500);
    const r = await page.evaluate(() => new Promise(done => {
      const v = window.__race.view, R = v.renderer, info = R.info; info.autoReset = false; info.reset(); if (v.adaptive) v.adaptive.tick = () => {}; let n = 0, t0 = performance.now(); const rr = R.render.bind(R); let depth = 0, cpu = 0; R.render = (...a) => { const s = performance.now(); depth++; rr(...a); depth--; if (!depth) cpu += performance.now() - s; };
      const tick = () => { if (++n < 40) requestAnimationFrame(tick); else done({ frames: n, calls: info.render.calls / n, trisK: info.render.triangles / n / 1000, cpuMs: cpu / n, fps: n * 1000 / (performance.now() - t0), lod: v.lod?.counts?.() }); };
      requestAnimationFrame(tick);
    }));
    console.log(map.padEnd(8), `calls=${r.calls.toFixed(0)} trisK=${r.trisK.toFixed(0)} renderCpuMs=${r.cpuMs.toFixed(1)} fps=${r.fps.toFixed(1)}`, r.lod ? `lod=${JSON.stringify(r.lod)}` : '');
    await page.close();
  }
} finally { await browser.close(); server.kill(); }
