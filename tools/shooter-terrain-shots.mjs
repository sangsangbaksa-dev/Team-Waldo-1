import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

// ZERO ZONE 장면 스크린샷: Math.random 을 고정해 같은 지도에서 마을·들판·자기장을 찍습니다. `node tools/shooter-terrain-shots.mjs <출력 폴더>`
const out = process.argv[2] || 'browser-artifacts/shooter-shots', port = 4190, origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;
await mkdir(out, { recursive: true });
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) break; } catch { /* 서버 대기 */ } await sleep(250); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1100, height: 620 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    localStorage.setItem('waldo.preferences.v1', JSON.stringify({ sound: false, quality: 'low', reducedMotion: true }));
    let s = 20261117; Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
  const errors = [];
  const page = await context.newPage(); page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/?pvp=local'); await page.click('#start-shooter'); await page.waitForSelector('.sz-setup-inner');
  await page.waitForFunction(() => !document.querySelector('[data-act="start"]')?.disabled, null, { timeout: 90000 });
  await page.click('[data-level="easy"]'); await page.click('[data-act="start"]');
  await page.waitForFunction(() => window.__zz?.phase === 'countdown' || window.__zz?.phase === 'play');
  await page.evaluate(() => window.__zz.go()); await page.waitForFunction(() => window.__zz.phase === 'play');
  await page.evaluate(() => {
    const match = window.__zz.match;
    // Terrain captures use the real renderer, with the match held still between shots.
    match.step = () => undefined;
    for (const player of match.players) { player.air = 0; player.alt = 0; }
  });
  // 지형 장면: [이름, 위치 계산식, 시선, 고개, 고도]
  const aim = (fx, fz, back, alt, pitch, ang = Math.PI) => ({ x: fx + Math.cos(ang) * back, z: fz + Math.sin(ang) * back, yaw: Math.atan2(-Math.sin(ang), -Math.cos(ang)), pitch, alt, fx, fz });
  const shots = [
    ['overview', t => ({ x: t.cs[0].x, z: t.cs[0].z + 30, yaw: -Math.PI / 2, pitch: -1.2, alt: 190 })],
    ['pad-edge', t => aim(t.cs[2].x, t.cs[2].z, t.cs[2].r + 12, 3, -0.2)],
    ['river-top', t => t.river && aim(t.river[0], t.river[1], 0, 90, -1.4)], ['river-low', t => t.river && aim(t.river[0], t.river[1], 28, 2.5, -0.08, 0.5)],
    ['lake-top', t => t.lake && aim(t.lake.x, t.lake.z, 0, 110, -1.4)], ['lake-low', t => t.lake && aim(t.lake.x, t.lake.z, t.lake.rx + 22, 3, -0.06, 0.9)],
    ['swamp-top', t => t.swamp && aim(t.swamp.x, t.swamp.z, 0, 110, -1.4)], ['swamp-low', t => t.swamp && aim(t.swamp.x, t.swamp.z, t.swamp.rx + 18, 3, -0.04, 0.9)],
    ['hill-top', t => t.hill && aim(t.hill.x, t.hill.z, 0, 90, -1.4)], ['hill-low', t => t.hill && aim(t.hill.x, t.hill.z, t.hill.r + 24, 3, 0.1, 0.9)],
    ['cliff-low', t => t.cliff && aim((t.cliff.x0 + t.cliff.x1) / 2, (t.cliff.z0 + t.cliff.z1) / 2, 24, 3, 0.1, 1.2)],
    ['forest-low', t => t.forest && aim(t.forest.x, t.forest.z, t.forest.r + 12, 3, 0.0, 0.3)], ['forest-top', t => t.forest && aim(t.forest.x, t.forest.z, 0, 90, -1.4)],
    ['bridge', t => t.bridge && aim(t.bridge.x, t.bridge.z, 28, 3, -0.1, t.bridge.ry + 0.4)],
    ['buildings', t => t.special && aim(t.special.x, t.special.z, 20, 2, 0.05, 0.4)],
  ];
  const info = await page.evaluate(() => {
    const t = window.__zz.match.map.terrain, m = window.__zz.match.map, mid = a => a && a.length ? a[0] : null; void 0;
    const rv = t.rivers[0], pt = rv ? rv.pts[Math.floor(rv.pts.length / 2)] : null;
    const special = m.buildings.find(b => ['church', 'hangar', 'silo', 'clinic', 'diner'].includes(b.type));
    return { cs: m.compounds, river: pt, lake: t.ponds.find(p => !p.swamp), swamp: t.ponds.find(p => p.swamp), hill: mid(t.hills), cliff: mid(t.cliffs), forest: mid(t.forests), bridge: mid(t.bridges), special };
  });
  console.log('terrain', JSON.stringify({ river: !!info.river, lake: !!info.lake, swamp: !!info.swamp, hill: !!info.hill, cliff: !!info.cliff, forest: !!info.forest, bridge: !!info.bridge, special: info.special?.type }));
  for (const [name, f] of shots) {
    const at = (() => { try { return f(info); } catch { return null; } })(); if (!at) { console.log('skip', name); continue; }
    const image = await page.evaluate(at => {
      const game = window.__zz, me = game.me();
      Object.assign(me, { x: at.x, z: at.z, alt: at.alt, hp: 100, yaw: at.yaw, pitch: at.pitch });
      for (const player of game.match.players) {
        if (player.id !== me.id) { player.x = 9999; player.z = 9999; }
      }
      game.view.frame(1 / 60, me, null, 1);
      return document.querySelector('.sz-canvas').toDataURL('image/png');
    }, at);
    const prefix = 'data:image/png;base64,';
    if (!image.startsWith(prefix)) throw new Error(`Could not capture terrain scene: ${name}`);
    await writeFile(`${out}/${name}.png`, Buffer.from(image.slice(prefix.length), 'base64'));
    console.log('captured', name);
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser?.close(); server.kill(); }
