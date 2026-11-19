import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

// ZERO ZONE 차량·폭격 장면 스크린샷: 탑승 전 · 운전 · 충돌 · 폭발 · 폭격. `node tools/shooter-vehicle-shots.mjs <출력 폴더>`
const out = process.argv[2] || 'browser-artifacts/shooter-vehicle', port = 4193, origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;
await mkdir(out, { recursive: true });
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) break; } catch { /* 서버 대기 */ } await sleep(250); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 1100, height: 620 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => { let s = 20261117; Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
  const errors = [];
  const page = await context.newPage(); page.setDefaultTimeout(90000); page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/'); await page.click('#start-shooter'); await page.waitForSelector('.sz-setup-inner');
  await page.waitForFunction(() => !document.querySelector('[data-act="start"]')?.disabled, null, { timeout: 90000 });
  await page.click('[data-level="easy"]'); await page.click('[data-act="start"]');
  await page.waitForFunction(() => window.__zz?.phase === 'countdown' || window.__zz?.phase === 'play');
  await page.evaluate(() => window.__zz.go()); await page.waitForFunction(() => window.__zz.phase === 'play');
  const step = async sec => page.evaluate(s => { const m = window.__zz.match; for (let i = 0; i < s * 30; i++) { m.step(1 / 30); m.drain(); } }, sec);
  // 낙하 건너뛰고 지상으로: 가까운 차 옆에 서서 시작
  const info0 = await page.evaluate(() => {
    const z = window.__zz, m = z.match, me = z.me(); me.air = 0; me.alt = 0; me.hp = 1e5;
    for (const p of m.players) if (p.id !== 0) { p.hp = 1e5; p.x = 9999; p.z = 9999; }
    const v = m.vehicles.filter(x => !x.wreck).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
    const side = v.d / 2 + 1.1; me.x = v.x - Math.sin(v.yaw) * side - Math.cos(v.yaw) * 1.5; me.z = v.z + Math.cos(v.yaw) * side - Math.sin(v.yaw) * 1.5; z.look(v.yaw - 0.9, -0.1);
    return { n: m.vehicles.length, kind: v.kind, x: v.x, z: v.z };
  });
  await sleep(1500); await page.screenshot({ path: out + '/1-parked.png' });
  await page.keyboard.down('KeyE'); await sleep(1800); await page.keyboard.up('KeyE'); await sleep(1200);
  console.log('veh', await page.evaluate(() => window.__zz.me().veh), 'frames', await page.evaluate(() => window.__zz.view.frames));
  await page.keyboard.down('KeyW'); await sleep(1500); await step(2.5); await sleep(1500);
  await page.screenshot({ path: out + '/2-driving.png' });
  await page.keyboard.down('KeyD'); await sleep(1500); await step(1.2); await sleep(1200); await page.keyboard.up('KeyD'); await step(0.5); await sleep(1500);
  await page.screenshot({ path: out + '/3-fast.png' });
  await page.evaluate(() => { const z = window.__zz, m = z.match, me = z.me(), v = m.vehicles[me.veh]; if (v) { v.hp = v.max * 0.3; } });
  await step(1); await sleep(1500); await page.screenshot({ path: out + '/4-damaged.png' });
  await page.keyboard.up('KeyW');
  await page.evaluate(() => { const z = window.__zz, m = z.match, me = z.me(), v = m.vehicles[me.veh]; if (v) m.hurtVehicle(v, 9999, -1); });
  await sleep(1500); await page.screenshot({ path: out + '/5-boom.png' }); await step(2); await sleep(1500); await page.screenshot({ path: out + '/6-wreck.png' });
  await page.evaluate(() => { const z = window.__zz, m = z.match, me = z.me(), r = m.reds[0]; me.hp = 1e5; me.x = r.x; me.z = r.z + 34; m.t = r.call + 0.01; z.look(-Math.PI / 2, 0.15); });
  await sleep(1200); await page.screenshot({ path: out + '/7-redcall.png' });
  await page.evaluate(() => { const m = window.__zz.match, r = m.reds[0]; m.t = r.start + 6; });
  await sleep(700); await page.screenshot({ path: out + '/8-shells.png' });
  const info = await page.evaluate(() => { const m = window.__zz.match; return { vehicles: m.vehicles.length, shells: m.shells.length }; });
  console.log(JSON.stringify(info0), JSON.stringify(info), 'errors:', errors.length ? errors : 'none');
} finally { await browser?.close(); server.kill(); }
