import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

// LAST CITY 프레임 비용 측정: 그리기 호출·삼각형 수와 CPU 시간(시뮬레이션 / R3.draw), 동적 해상도 배율을 잰다. `node tools/city-perf.mjs [high|standard|low]`
const quality = process.argv[2] || 'high', port = 4195, origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) break; } catch { /* 서버 대기 */ } await sleep(250); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1100, height: 620 } });
  await context.addInitScript(q => { localStorage.setItem('waldo.preferences.v1', JSON.stringify({ sound: false, quality: q, reducedMotion: false })); }, quality);
  const page = await context.newPage(); page.setDefaultTimeout(120000);
  await page.goto(origin + '/'); await page.locator('#start-city').click(); await page.locator('.c-setup').waitFor();
  await page.locator('[data-act="class:warlord"]').click(); await page.locator('.city-hud').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !!window.__city?.world && !!window.__city.r3);
  await sleep(3000);
  const measure = () => page.evaluate(async () => {
    const c = window.__city, r3 = c.r3, w = c.world, out = { draw: [], step: [], calls: [], tris: [], frames: 0 };
    const od = r3.draw.bind(r3), os = w.step.bind(w); r3.renderer.info.autoReset = false;
    r3.draw = (...a) => { r3.renderer.info.reset(); const t = performance.now(); const r = od(...a); out.draw.push(performance.now() - t); out.calls.push(r3.renderer.info.render.calls); out.tris.push(r3.renderer.info.render.triangles); return r; };
    w.step = (...a) => { const t = performance.now(); const r = os(...a); out.step.push(performance.now() - t); return r; };
    const t0 = performance.now(); await new Promise(res => { const f = () => { out.frames++; if (performance.now() - t0 < 8000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    r3.draw = od; w.step = os; r3.renderer.info.autoReset = true;
    const secs = (performance.now() - t0) / 1000, avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    return { fps: +(out.frames / secs).toFixed(1), drawAvgMs: +avg(out.draw).toFixed(2), stepAvgMs: +avg(out.step).toFixed(2), calls: Math.round(avg(out.calls)), triangles: Math.round(avg(out.tris)), pixelRatio: r3.renderer.getPixelRatio(), scale: r3.pr };
  });
  console.log(quality, 'first 8s', JSON.stringify(await measure()));
  console.log(quality, 'next 8s ', JSON.stringify(await measure()));
} finally { await browser?.close(); server.kill(); }
