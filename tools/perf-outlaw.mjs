// OUTLAW CITY 성능 측정: 시점별 프레임당 draw call·삼각형·렌더 CPU. `node tools/perf-outlaw.mjs` (소프트웨어 GL: 전후 비교용)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const port = 6000 + Math.floor(Math.random() * 200), origin = `http://127.0.0.1:${port}/`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 120; i++) { try { if ((await fetch(origin)).ok) break; } catch { /* wait */ } await sleep(250); }
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  await ctx.addInitScript(() => localStorage.setItem('waldo.preferences.v1', JSON.stringify({ sound: false, quality: 'high', reducedMotion: false })));
  const page = await ctx.newPage(); page.setDefaultTimeout(120000);
  await page.goto(origin + '#/outlaw'); await page.waitForFunction(() => !!window.__ol); await sleep(1000);
  await page.getByText('시작', { exact: true }).first().click(); await page.waitForFunction(() => window.__ol.phase === 'play'); await sleep(2500);
  const half = await page.evaluate(() => window.__ol.sim.map.half ?? 1000);
  for (const [name, fx, fz] of [['spawn', null, null], ['center', 0, 0], ['quarter', 0.5, 0.5], ['edge', -0.8, 0.7]]) {
    if (fx !== null) await page.evaluate(([x, z]) => window.__ol.teleport(x, z), [fx * half, fz * half]);
    await sleep(2500);
    const r = await page.evaluate(() => new Promise(done => {
      const R = window.__ol.renderer, info = R.info; info.autoReset = false; info.reset(); let n = 0, cpu = 0, depth = 0; const t0 = performance.now(), rr = R.render.bind(R); R.render = (...a) => { const s = performance.now(); depth++; rr(...a); depth--; if (!depth) cpu += performance.now() - s; };
      const tick = () => { if (++n < 20) requestAnimationFrame(tick); else { R.render = rr; info.autoReset = true; done({ calls: info.render.calls / n, trisK: info.render.triangles / n / 1000, cpuMs: cpu / n, fps: n * 1000 / (performance.now() - t0) }); } };
      requestAnimationFrame(tick);
    }));
    console.log(name.padEnd(8), `calls=${r.calls.toFixed(0)} trisK=${r.trisK.toFixed(0)} renderCpuMs=${r.cpuMs.toFixed(1)} fps=${r.fps.toFixed(1)}`);
  }
} finally { await browser.close(); server.kill(); }
