import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

// LAST CITY 3D 장면 스크린샷: 시간대·날씨·카메라 각도를 고정해 찍는다. `node tools/city-shots.mjs <출력 폴더> [시나리오 이름 필터]`
const out = process.argv[2] || 'browser-artifacts/city-shots', only = process.argv[3] || '', onlyView = process.argv[4] || '', port = 4193, origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BLOCK = 440, ROAD = 120, PITCH = BLOCK + ROAD;
const road = i => i * PITCH + ROAD / 2;   // i번째 도로 중심선
// [이름, 시각, 날씨]
const MOODS = [['dayclear', 10, 'clear'], ['dayrain', 12, 'rain'], ['duskrain', 19, 'rain'], ['nightrain', 23, 'rain'], ['nightstorm', 1, 'storm']];
// [이름, 위치 x, z, 방향(rad), 피치, 모드]
const VIEWS = [
  ['street', road(4), road(2) + 700, -Math.PI / 2, 0.02, 'fp'],
  ['tp', road(6) + 60, road(3) + 330, -Math.PI / 2, 0.08, 'tp'],
  ['junction', road(3) + 60, road(3) + 80, -Math.PI / 4, 0.12, 'fp'],
  ['open', 'plaza', 0, 0.9, 0.14, 'fp'],
  ['openN', 'plaza', 0, -0.9, 0.14, 'fp'],
  ['skyline', road(4), road(5), -Math.PI / 2, 0.16, 'fp'],
  ['sky', road(4), road(5), -Math.PI / 2, 0.5, 'fp'],
  ['skyhigh', road(4), road(5), -Math.PI / 4, 0.95, 'fp'],
  ['skylineE', road(5), road(4), Math.PI, 0.16, 'fp'],
];
let browser;
await mkdir(out, { recursive: true });
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) break; } catch { /* 서버 대기 */ } await sleep(250); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1100, height: 620 } });
  await context.addInitScript(() => { let s = 20261119; Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
  const errors = [];
  const page = await context.newPage(); page.setDefaultTimeout(90000); page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(origin + '/'); await page.locator('#start-city').click(); await page.locator('.c-setup').waitFor();
  await page.locator('[data-act="class:warlord"]').click(); await page.locator('.city-hud').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !!window.__city?.world && !!window.__city.r3);
  await sleep(2500);
  // HUD는 장면만 보이게 숨긴다.
  await page.addStyleTag({ content: '.city-hud, .city-hud *, #c-layer, #c-layer * { visibility: hidden !important; }' });
  await page.evaluate(() => {
    const w = window.__city.world, orig = w.everySecond.bind(w);
    const PH = h => (h >= 5 && h < 8 ? 'dawn' : h >= 8 && h < 18 ? 'day' : h >= 18 && h < 21 ? 'dusk' : 'night');
    w.everySecond = () => { orig(); if (window.__fm) { w.hour = window.__fm.hour; w.phase = PH(w.hour); w.weather = window.__fm.weather; } };
  });
  for (const [mname, hour, weather] of MOODS) {
    if (only && !mname.includes(only)) continue;
    await page.evaluate(([hour, weather]) => { window.__fm = { hour, weather }; const w = window.__city.world; w.hour = hour; w.weather = weather; window.__city.r3.snapAtmosphere?.(); }, [hour, weather]);
    for (const [vname, x, z, yaw, pitch, mode] of VIEWS) {
      if (onlyView && !onlyView.split(',').includes(vname)) continue;
      await page.evaluate(([x, z, yaw, pitch, mode]) => {
        const c = window.__city, w = c.world, b = w.boss(0); if (x === 'plaza') { const pb = w.map.blocks.find(q => q.type === 'plaza') ?? w.map.blocks[0]; x = pb.x + 220; z = pb.y + 220; } if (b) { b.x = x; b.y = z; b.hp = b.maxHp ?? b.hp; }
        c.r3.yaw = yaw; c.r3.pitch = pitch; c.r3.mode = mode; c.r3.camPos.set(x, 60, z);
      }, [x, z, yaw, pitch, mode]);
      await sleep(1400);
      await page.screenshot({ path: `${out}/${mname}-${vname}.png` });
    }
  }
  console.log('errors', errors);
} finally { await browser?.close(); server.kill(); }
