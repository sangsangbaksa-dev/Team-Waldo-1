import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

// HUSTLE 장면 스크린샷: `node tools/tycoon-shots.mjs <출력 폴더> [장면 이름…]`. 개발 서버의 __ty 디버그 훅으로 시간·단계·위치를 정해 찍습니다.
const out = process.argv[2] || 'browser-artifacts/tycoon-shots', only = process.argv.slice(3), port = 4195, origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;
await mkdir(out, { recursive: true });
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) break; } catch { /* 서버 대기 */ } await sleep(250); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const mobile = process.env.MOBILE === '1';
  const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: +(process.env.VIEW || '1280x720').split('x')[0], height: +(process.env.VIEW || '1280x720').split('x')[1] }, deviceScaleFactor: 1 });
  await context.addInitScript(q => { let s = 20261119; Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; localStorage.setItem('waldo.preferences.v1', JSON.stringify({ sound: false, quality: q, reducedMotion: false })); }, process.env.Q || 'high');
  const errors = [];
  const page = await context.newPage(); page.setDefaultTimeout(90000); page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 4).join('|'))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(origin + '/'); await page.click('#start-tycoon'); await page.waitForFunction(() => window.__ty?.phase === 'title');
  const shot = async name => { if (only.length && !only.includes(name)) return; await page.screenshot({ path: `${out}/${name}.png` }); };
  await sleep(1500); await shot('title');
  await page.evaluate(() => window.__ty.start('new')); await sleep(1500); await shot('start');
  // 장면 정의: 단계(캐시로 올림)·시각·위치·카메라
  const scenes = JSON.parse(process.env.SCENES || '[]');
  for (const sc of scenes) {
    await page.evaluate(sc => { const t = window.__ty; if (sc.stage) t.core.data.stage = sc.stage; if (sc.cash !== undefined) t.core.data.cash = sc.cash; if (sc.rain) { let d = 1; while (!t.atmo().constructor.rainyDay(d)) d++; t.core.data.day = d; } if (sc.minutes !== undefined) t.core.data.minute = sc.minutes; if (sc.day) t.core.data.day = sc.day; t.core.tick(0.2); if (sc.tp) t.player.teleport(sc.tp[0], sc.tp[1], sc.tp[2] ?? 0); if (sc.yaw !== undefined) t.player.camYaw = sc.yaw; if (sc.pitch !== undefined) t.player.camPitch = sc.pitch; if (sc.dist) t.player.dist = sc.dist; if (sc.fp !== undefined) t.player.setFirstPerson(sc.fp); if (sc.spot) t.openSpot(sc.spot); if (sc.modal) t.openModal(sc.modal); if (sc.nohud) t.hud.style.display = 'none'; }, sc);
    await sleep(sc.wait ?? 2500); await shot(sc.name);
    if (sc.spot || sc.modal) await page.evaluate(() => window.__ty.closeModal());
  }
  console.log(JSON.stringify({ errors: errors.slice(0, 8) }));
} finally { await browser?.close(); server.kill(); }
