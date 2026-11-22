// LAST CITY 장면 비용 분해: 시점 하나에서 최상위 오브젝트별 드로우콜·삼각형을 잰다. `node tools/city-scene-cost.mjs [high|standard|low]`
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const q = process.argv[2] || 'high', port = 4199, origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: process.cwd(), stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const road = i => i * 560 + 60;
let browser;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) break; } catch {} await sleep(250); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 320, height: 180 } });
  await ctx.addInitScript(q => localStorage.setItem('waldo.preferences.v1', JSON.stringify({ sound: false, quality: q, reducedMotion: false })), q);
  const page = await ctx.newPage(); page.setDefaultTimeout(120000);
  await page.goto(origin + '/'); await page.locator('#start-city').click(); await page.locator('.c-setup').waitFor();
  await page.locator('[data-act="class:warlord"]').click(); await page.locator('.city-hud').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !!window.__city?.r3); await sleep(1500);
  const out = await page.evaluate(async ([x, z, process_env]) => {
    const c = window.__city, r3 = c.r3, w = c.world, b = w.boss(0); b.x = x; b.y = z; r3.yaw = -Math.PI / 2; r3.pitch = 0.02; r3.mode = 'fp'; w.hour = +(process_env.HOUR ?? 23); w.weather = process_env.WEATHER ?? 'rain'; r3.snapAtmosphere();
    for (let i = 0; i < 5; i++) { r3.draw(0.016, null); await new Promise(r => setTimeout(r, 30)); }
    const R = r3.renderer, info = R.info; info.autoReset = false; const kids = r3.scene.children.slice(), vis = kids.map(k => k.visible);
    const measure = () => { info.reset(); R.render(r3.scene, r3.camera); return { calls: info.render.calls, tris: info.render.triangles }; };
    const shadowWas = R.shadowMap.enabled; R.shadowMap.enabled = false;
    const all = measure(); const rows = [];
    kids.forEach(k => k.visible = false); const base = measure();
    kids.forEach((k, i) => { k.visible = true; const m = measure(); k.visible = false; const d = { calls: m.calls - base.calls, tris: m.tris - base.tris }; if (d.tris > 0 || d.calls > 0) { const g = k.geometry; rows.push({ dist: k.boundingSphere ? Math.round(Math.hypot(k.boundingSphere.center.x - x, k.boundingSphere.center.z - z)) : -1, i, type: k.type, name: k.name, count: k.count, per: g ? (g.index ? g.index.count : g.attributes?.position?.count) / 3 : null, kids: k.children?.length, cast: k.castShadow, calls: d.calls, tris: d.tris }); } });
    kids.forEach((k, i) => k.visible = vis[i]);
    // 그림자 패스 비용
    R.shadowMap.enabled = shadowWas; R.shadowMap.needsUpdate = true; const withShadow = measure();
    rows.sort((a, b) => b.tris - a.tris);
    const cat = {}; for (const r of rows) { const k = r.type + (r.count ? ':inst' : ''); const c = cat[k] ??= { n: 0, calls: 0, tris: 0 }; c.n++; c.calls += r.calls; c.tris += r.tris; }
    return { all, withShadow, base, rows: rows.slice(0, 28), n: kids.length, cat };
  }, [road(4), road(2) + 700, { HOUR: process.env.HOUR, WEATHER: process.env.WEATHER }]);
  console.log(q, 'main(no shadow)', JSON.stringify(out.all), 'with shadow', JSON.stringify(out.withShadow), 'children', out.n);
  console.log('by category', JSON.stringify(out.cat));
  for (const r of out.rows) console.log(JSON.stringify(r));
} finally { await browser?.close(); server.kill(); }
