import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

// LAST CITY 성능 측정: 장면별로 draw call·삼각형 수와 프레임 시간(r3.draw CPU, 전체 rAF 간격)을 잰다.
// `node tools/city-perf-scenes.mjs [high|standard|low] [시나리오 필터]` — 소프트웨어 GL(SwiftShader)이라 절대값보다 전후 비교용입니다.
const quality = process.argv[2] || 'high', only = process.argv[3] || '', port = 4197, origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BLOCK = 440, ROAD = 120, PITCH = BLOCK + ROAD, road = i => i * PITCH + ROAD / 2;
const SCENES = [
  ['night-rain-street', 23, 'rain', road(4), road(2) + 700, -Math.PI / 2, 0.02, 'fp'],
  ['night-rain-junction', 23, 'rain', road(3) + 60, road(3) + 80, -Math.PI / 4, 0.12, 'fp'],
  ['dusk-rain-tp', 19, 'rain', road(6) + 60, road(3) + 330, -Math.PI / 2, 0.08, 'tp'],
  ['day-clear-street', 10, 'clear', road(4), road(2) + 700, -Math.PI / 2, 0.02, 'fp'],
  ['night-storm-skyline', 1, 'storm', road(4), road(5), -Math.PI / 2, 0.16, 'fp'],
];
let browser;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) break; } catch { /* 서버 대기 */ } await sleep(250); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 480, height: 270 } });
  await context.addInitScript(q => { localStorage.setItem('waldo.preferences.v1', JSON.stringify({ sound: false, quality: q, reducedMotion: false })); }, quality);
  const page = await context.newPage(); page.setDefaultTimeout(120000);
  await page.goto(origin + '/'); await page.locator('#start-city').click(); await page.locator('.c-setup').waitFor();
  await page.locator('[data-act="class:warlord"]').click(); await page.locator('.city-hud').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !!window.__city?.world && !!window.__city.r3);
  await sleep(2500);
  await page.evaluate(() => {
    const w = window.__city.world, orig = w.everySecond.bind(w);
    w.everySecond = () => { orig(); if (window.__fm) { w.hour = window.__fm.hour; w.weather = window.__fm.weather; } };
    const r3 = window.__city.r3, d = r3.draw.bind(r3); window.__perf = { n: 0, cpu: 0, max: 0, calls: 0, tris: 0, times: [], parts: {}, frames: [] }; r3.adaptive = false; let probed = false; const cube = r3.wetStreet.cube; if (cube) { const u = cube.update.bind(cube); cube.update = (...a) => { probed = true; return u(...a); }; }
    r3.renderer.info.autoReset = false;
    r3.draw = (dt, g) => { r3.renderer.info.reset(); const t0 = performance.now(); d(dt, g); const c = performance.now() - t0, p = window.__perf; p.n++; p.cpu += c; p.max = Math.max(p.max, c); p.times.push(c); p.calls = r3.renderer.info.render.calls; p.tris = r3.renderer.info.render.triangles; p.frames.push({ c, calls: p.calls, tris: p.tris, probe: probed }); probed = false; };
    // 구간별 CPU 시간(제출 비용): 느린 구간을 찾기 위한 계측
    const wrap = (o, k, name) => { const f = o[k].bind(o); o[k] = (...a) => { const t0 = performance.now(); const r = f(...a); const c = performance.now() - t0, q = window.__perf.parts[name] ??= { sum: 0, max: 0 }; q.sum += c; q.max = Math.max(q.max, c); return r; }; };
    wrap(r3.wetStreet, 'update', 'wetStreet'); wrap(r3.streetFx, 'update', 'streetFx'); wrap(r3.skyline, 'update', 'skyline'); wrap(r3.skyDome, 'update', 'skyDome'); wrap(r3, 'updateRain', 'rain'); wrap(r3.bfx, 'setMood', 'bfxMood'); if (r3.post) wrap(r3.post, 'render', 'post.render'); if (r3.ml) wrap(r3.ml, 'update', 'ml.update');
  });
  const info = await page.evaluate(() => { const r = window.__city.r3.renderer.info; return { geometries: r.memory.geometries, textures: r.memory.textures, programs: r.programs?.length }; });
  console.log('quality', quality, 'init', JSON.stringify(info));
  for (const [name, hour, weather, x, z, yaw, pitch, mode] of SCENES) {
    if (only && !name.includes(only)) continue;
    await page.evaluate(([hour, weather, x, z, yaw, pitch, mode]) => {
      window.__fm = { hour, weather }; const c = window.__city, w = c.world, b = w.boss(0); w.hour = hour; w.weather = weather; c.r3.snapAtmosphere?.();
      if (b) { b.x = x; b.y = z; b.hp = b.maxHp ?? b.hp; } c.r3.yaw = yaw; c.r3.pitch = pitch; c.r3.mode = mode; c.r3.camPos.set(x, 60, z);
    }, [hour, weather, x, z, yaw, pitch, mode]);
    await sleep(2500);
    const res = await page.evaluate(() => new Promise(done => {
      const p = window.__perf; p.n = 0; p.cpu = 0; p.max = 0; p.times = []; p.parts = {}; p.frames = []; const stamps = []; let k = 0;
      const tick = t => { stamps.push(t); if (++k < 30) requestAnimationFrame(tick); else {
        const gaps = stamps.slice(1).map((v, i) => v - stamps[i]).sort((a, b) => a - b), st = p.times.slice().sort((a, b) => a - b);
        done({ fps: 1000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length), gapP50: gaps[gaps.length >> 1], gapP95: gaps[Math.floor(gaps.length * 0.95)], gapMax: gaps[gaps.length - 1], drawAvg: p.cpu / p.n, drawP95: st[Math.floor(st.length * 0.95)], drawMax: p.max, ...(() => { const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1], n = p.frames.filter(f => !f.probe), pr = p.frames.filter(f => f.probe); return { normCalls: n.length ? med(n.map(f => f.calls)) : -1, normTrisK: n.length ? Math.round(med(n.map(f => f.tris)) / 1000) : -1, probeFrames: pr.length, probeCalls: pr.length ? med(pr.map(f => f.calls)) : -1, probeTrisK: pr.length ? Math.round(med(pr.map(f => f.tris)) / 1000) : -1, probeCpuMs: pr.length ? med(pr.map(f => f.c)) : -1 }; })(), parts: Object.entries(p.parts).map(([n, q]) => `${n}:${(q.sum / p.n).toFixed(2)}/${q.max.toFixed(1)}`).join(' ') });
      } };
      requestAnimationFrame(tick);
    }));
    console.log(name.padEnd(22), Object.entries(res).map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(k === 'fps' ? 1 : 1) : v}`).join(' '));
  }
} finally { await browser?.close(); server.kill(); }
