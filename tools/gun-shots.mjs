import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

// ZERO ZONE 총기 스크린샷: 1인칭 총(무기·파츠별)과 조립 화면(데스크톱·모바일). `node tools/gun-shots.mjs <출력 폴더>`
const out = process.argv[2] || 'browser-artifacts/gun-shots', port = 4191, origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;
await mkdir(out, { recursive: true });
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) break; } catch { /* 서버 대기 */ } await sleep(250); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1100, height: 620 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => { let s = 20261118; Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
  const errors = [];
  const page = await context.newPage(); page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(origin + '/'); await page.click('#start-shooter'); await page.waitForSelector('.sz-setup-inner');
  await page.waitForFunction(() => !document.querySelector('[data-act="start"]')?.disabled, null, { timeout: 90000 });
  const only = process.argv[3] || 'all';
  if (only === 'all' || only === 'fp') {
    await page.click('[data-level="easy"]'); await page.click('[data-act="start"]');
    await page.waitForFunction(() => window.__zz?.phase === 'countdown' || window.__zz?.phase === 'play');
    await page.evaluate(() => window.__zz.go()); await page.waitForFunction(() => window.__zz.phase === 'play');
    await page.evaluate(() => { for (const p of window.__zz.match.players) { p.air = 0; p.alt = 0; } const me = window.__zz.me(); me.x = 40; me.z = -60; me.hp = 100; for (const p of window.__zz.match.players) if (p.id !== me.id) { p.x = 9999; p.z = 9999; } window.__zz.look(0.8, 0.02); });
    const sets = [
      ['pistol', {}], ['smg', { sight: 'holo', muzzle: 'flash', grip: 'angled', mag: 'quickmag', stock: 'tactical' }], ['rifle', { sight: 'scope4', muzzle: 'suppressor', grip: 'grip', mag: 'extquick', stock: 'tactical' }],
      ['shotgun', { muzzle: 'comp', mag: 'extmag' }], ['sniper', { sight: 'scope8', muzzle: 'flash', mag: 'extmag', stock: 'cheek' }], ['rifle', {}],
    ];
    let n = 0;
    for (const [id, att] of sets) {
      await page.evaluate(({ id, att }) => { const me = window.__zz.me(); me.guns[0] = { id, mag: 30, reserve: 90, att }; me.cur = 0; }, { id, att });
      await sleep(900); await page.screenshot({ path: `${out}/fp-${n++}-${id}.png` });
    }
    await page.evaluate(() => { const me = window.__zz.me(); me.guns[0] = { id: 'rifle', mag: 30, reserve: 90, att: { sight: 'reddot', muzzle: 'comp' } }; me.cur = 0; window.__zz.ads(true); });
    await sleep(1000); await page.screenshot({ path: `${out}/fp-ads-rifle.png` });
  }
  if (only === 'all' || only === 'smith') {
    await page.evaluate(() => localStorage.removeItem('waldo.shooter.loadout.v1'));
    await page.click('[data-act="smith"]'); await page.waitForSelector('.gs-root'); await sleep(1500);
    await page.screenshot({ path: `${out}/smith-0-rifle.png` });
    await page.click('.gs-presets [data-preset="0"]'); await sleep(1800); await page.screenshot({ path: `${out}/smith-1-rifle-preset.png` });
    await page.click('.gs-parts [data-slot="muzzle"]'); await page.click('.gs-opt[data-part="suppressor"]'); await page.click('.gs-hot.muzzle'); await sleep(2000); await page.screenshot({ path: `${out}/smith-2-rifle-muzzle.png` });
    await page.click('.gs-weapons [data-w="sniper"]'); await page.click('.gs-parts [data-slot="sight"]'); await page.click('.gs-opt[data-part="scope8"]'); await sleep(1800); await page.screenshot({ path: `${out}/smith-3-sniper.png` });
    await page.click('.gs-weapons [data-w="smg"]'); await sleep(1200); await page.screenshot({ path: `${out}/smith-4-smg.png` });
    await page.click('.gs-weapons [data-w="pistol"]'); await sleep(1200); await page.screenshot({ path: `${out}/smith-5-pistol.png` });
    await page.click('.gs-weapons [data-w="shotgun"]'); await sleep(1200); await page.screenshot({ path: `${out}/smith-6-shotgun.png` });
    await page.click('.gs-done'); await page.waitForSelector('.gs-root', { state: 'detached' });
    // 모바일
    await page.setViewportSize({ width: 390, height: 780 }); await sleep(400);
    await page.click('[data-act="smith"]'); await page.waitForSelector('.gs-root'); await sleep(1500);
    await page.screenshot({ path: `${out}/smith-m0.png` });
    await page.click('.gs-tabs [data-tab="stats"]'); await sleep(300); await page.screenshot({ path: `${out}/smith-m1-stats.png` });
    await page.click('.gs-tabs [data-tab="parts"]'); await page.click('.gs-presets [data-preset="0"]'); await sleep(1500); await page.screenshot({ path: `${out}/smith-m2.png` });
    const saved = await page.evaluate(() => localStorage.getItem('waldo.shooter.loadout.v1')); console.log('saved', saved);
  }
  console.log('errors', errors);
} finally { await browser?.close(); server.kill(); }
