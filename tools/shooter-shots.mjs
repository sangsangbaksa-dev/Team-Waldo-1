import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

// ZERO ZONE 장면 스크린샷: Math.random 을 고정해 같은 지도에서 마을·들판·자기장을 찍습니다. `node tools/shooter-shots.mjs <출력 폴더>`
const out = process.argv[2] || 'browser-artifacts/shooter-shots', port = 4190, origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;
await mkdir(out, { recursive: true });
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) break; } catch { /* 서버 대기 */ } await sleep(250); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1100, height: 620 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => { let s = 20261117; Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
  const errors = [];
  const page = await context.newPage(); page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/'); await page.click('#start-shooter'); await page.waitForSelector('.sz-setup-inner');
  await page.waitForFunction(() => !document.querySelector('[data-act="start"]')?.disabled, null, { timeout: 90000 });
  await page.click('[data-level="easy"]'); await page.click('[data-act="start"]');
  await page.waitForFunction(() => window.__zz?.phase === 'countdown' || window.__zz?.phase === 'play');
  await page.evaluate(() => window.__zz.go()); await page.waitForFunction(() => window.__zz.phase === 'play');
  await page.evaluate(() => { for (const p of window.__zz.match.players) { p.air = 0; p.alt = 0; } }); // 장면 촬영은 땅에서 시작
  // 각 장면: [이름, 목표 위치 기준(마을 번호/절대), 거리, 시선 방향, 고개 각도]
  const shots = [
    ['town0', { town: 0, dx: -30, dz: 4 }, 0, 0.02], ['town1', { town: 1, dx: 0, dz: -32 }, Math.PI / 2, 0.02], ['town2', { town: 2, dx: 30, dz: 6 }, Math.PI, 0.03], ['town3', { town: 3, dx: -4, dz: 32 }, -Math.PI / 2, 0.02],
    ['town4', { town: 4, dx: -30, dz: -4 }, 0, 0.02], ['field', { x: 40, z: -60 }, 0.8, 0.04], ['edge', { x: 0, z: 0 }, 2.4, 0.0],
  ];
  await page.evaluate(() => { const me = window.__zz.me(); me.guns[0] = { id: 'rifle', mag: 40, reserve: 90, att: { sight: 'scope4', muzzle: 'suppressor', grip: 'grip', mag: 'extmag' } }; me.helmet = 2; me.boost = 14; me.cur = 0; });
  for (const [name, at, yaw, pitch] of shots) {
    await page.evaluate(({ at, yaw, pitch }) => {
      const z = window.__zz, m = z.match, me = z.me(), c = at.town !== undefined ? m.map.compounds[at.town % m.map.compounds.length] : null;
      me.x = c ? c.x + at.dx : at.x; me.z = c ? c.z + at.dz : at.z; me.hp = 100; for (const p of m.players) if (p.id !== me.id) { p.x = 9999; p.z = 9999; }
      z.look(yaw, pitch);
    }, { at, yaw, pitch });
    await sleep(1200);
    await page.screenshot({ path: `${out}/${name}.png` });
  }
  // 보급 투하: 상자가 내려오는 장면과 비행기
  await page.evaluate(() => { const z = window.__zz, m = z.match, d = m.drops[0], me = z.me(); m.t = d.at - 7; me.x = d.x - 40; me.z = d.z; z.look(0, 0.35); });
  await sleep(1500); await page.screenshot({ path: `${out}/airdrop-fall.png` });
  await page.evaluate(() => { const z = window.__zz, m = z.match, d = m.drops[0], me = z.me(); m.t = d.at + 4; me.x = d.x - 9; me.z = d.z; z.look(0, 0.0); });
  await sleep(1500); await page.screenshot({ path: `${out}/airdrop-land.png` });
  console.log('errors', errors);
} finally { await browser?.close(); server.kill(); }
