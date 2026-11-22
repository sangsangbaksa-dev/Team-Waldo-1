// ZERO ZONE 성능 측정: 장면별 프레임당 draw call·삼각형·렌더 CPU. `node tools/perf-shooter.mjs` (소프트웨어 GL: 전후 비교용)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const port = 5500 + Math.floor(Math.random() * 200), origin = `http://127.0.0.1:${port}/`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 120; i++) { try { if ((await fetch(origin)).ok) break; } catch { /* wait */ } await sleep(250); }
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const context = await browser.newContext({ viewport: { width: 640, height: 360 } });
  await context.addInitScript(() => { let s = 20261117; Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; localStorage.setItem('waldo.preferences.v1', JSON.stringify({ sound: false, quality: 'high', reducedMotion: false })); });
  const page = await context.newPage(); page.setDefaultTimeout(90000);
  await page.goto(origin); await page.click('#start-shooter'); await page.waitForSelector('.sz-setup-inner');
  await page.waitForFunction(() => !document.querySelector('[data-act="start"]')?.disabled, null, { timeout: 90000 });
  await page.click('[data-level="easy"]'); await page.click('[data-act="start"]');
  await page.waitForFunction(() => window.__zz?.phase === 'countdown' || window.__zz?.phase === 'play'); await page.evaluate(() => window.__zz.go()); await page.waitForFunction(() => window.__zz.phase === 'play');
  await page.evaluate(() => { for (const p of window.__zz.match.players) { p.air = 0; p.alt = 0; } });
  for (const [name, at, yaw, pitch] of [['town0', { town: 0, dx: -30, dz: 4 }, 0, 0.02], ['town2', { town: 2, dx: 30, dz: 6 }, Math.PI, 0.03], ['field', { x: 40, z: -60 }, 0.8, 0.04], ['edge', { x: 0, z: 0 }, 2.4, 0.0]]) {
    await page.evaluate(({ at, yaw, pitch }) => { const z = window.__zz, m = z.match, me = z.me(), c = at.town !== undefined ? m.map.compounds[at.town % m.map.compounds.length] : null; me.x = c ? c.x + at.dx : at.x; me.z = c ? c.z + at.dz : at.z; me.hp = 100; for (const p of m.players) if (p.id !== me.id) { p.x = 9999; p.z = 9999; } z.look(yaw, pitch); }, { at, yaw, pitch });
    await sleep(1500);
    if (process.argv[2] === 'cost' && name === 'field') { console.log(JSON.stringify(await page.evaluate(() => {
      const v = window.__zz.view, R = v.renderer, info = R.info; info.autoReset = false; const kids = v.scene.children.slice(), vis = kids.map(k => k.visible); const sh = R.shadowMap.enabled; R.shadowMap.enabled = false; v.post = null;
      const measure = () => { info.reset(); R.render(v.scene, v.camera); return [info.render.calls, info.render.triangles]; };
      kids.forEach(k => k.visible = false); const base = measure(), rows = [];
      kids.forEach(k => { k.visible = true; const m = measure(); k.visible = false; if (m[1] - base[1] > 0 || m[0] - base[0] > 0) rows.push({ type: k.type, name: k.name, n: k.count ?? k.children?.length, calls: m[0] - base[0], tris: m[1] - base[1] }); });
      kids.forEach((k, i) => k.visible = vis[i]); R.shadowMap.enabled = sh; rows.sort((a, b) => b.tris - a.tris); return rows.slice(0, 14);
    })).replaceAll('},{', '}\n{')); }
    if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}-${name}.png` });
    const r = await page.evaluate(() => new Promise(done => {
      const v = window.__zz.view, R = v.renderer, info = R.info; info.autoReset = false; info.reset(); v.adapt && (v.adapt.tick = () => {}); let n = 0, cpu = 0, depth = 0; const t0 = performance.now(), rr = R.render.bind(R); R.render = (...a) => { const s = performance.now(); depth++; rr(...a); depth--; if (!depth) cpu += performance.now() - s; };
      const tick = () => { if (++n < 30) requestAnimationFrame(tick); else { R.render = rr; info.autoReset = true; done({ calls: info.render.calls / n, trisK: info.render.triangles / n / 1000, cpuMs: cpu / n, fps: n * 1000 / (performance.now() - t0), lod: v.lod?.counts?.() }); } };
      requestAnimationFrame(tick);
    }));
    console.log(name.padEnd(8), `calls=${r.calls.toFixed(0)} trisK=${r.trisK.toFixed(0)} renderCpuMs=${r.cpuMs.toFixed(1)} fps=${r.fps.toFixed(1)}`, r.lod ? `lod=${JSON.stringify(r.lod)}` : '');
  }
} finally { await browser.close(); server.kill(); }
