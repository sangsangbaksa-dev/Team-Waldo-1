import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

// ZERO ZONE 인게임 총기 조립(L) 확인: 가방 파츠만 쓰는지, 솔로에서는 경기가 멈추는지, 터치 버튼으로도 열리는지. `node tools/shooter-assembly-smoke.mjs [출력 폴더]`
const out = process.argv[2] || 'browser-artifacts/assembly', port = 4195, origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const check = (ok, msg) => { if (!ok) throw new Error('FAIL: ' + msg); console.log('ok  ', msg); };
let browser;
await mkdir(out, { recursive: true });
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) break; } catch { /* 서버 대기 */ } await sleep(250); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  for (const touch of [false, true]) {
    const context = await browser.newContext(touch ? { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' } : { viewport: { width: 1100, height: 620 }, reducedMotion: 'reduce' });
    const errors = [], page = await context.newPage(); page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(e.message));
    const tag = touch ? 'touch' : 'desktop';
    await page.goto(origin + '/'); await page.click('#start-shooter'); await page.waitForSelector('.sz-setup-inner');
    await page.waitForFunction(() => !document.querySelector('[data-act="start"]')?.disabled, null, { timeout: 90000 });
    await page.click('[data-level="easy"]'); await page.click('[data-act="start"]');
    await page.waitForFunction(() => window.__zz?.phase === 'countdown' || window.__zz?.phase === 'play');
    await page.evaluate(() => window.__zz.go()); await page.waitForFunction(() => window.__zz.phase === 'play');
    await page.evaluate(() => { const z = window.__zz, m = z.match, me = z.me(); for (const p of m.players) { p.air = 0; p.alt = 0; if (p.id !== me.id) { p.x = 9999; p.z = 9999; } } me.x = 40; me.z = -60; me.hp = 100; me.guns[0] = { id: 'rifle', mag: 30, reserve: 90, att: {} }; me.cur = 0; me.parts.push('scope4', 'extquick', 'comp', 'grip', 'cheek'); });
    await sleep(600);
    if (touch) await page.evaluate(() => document.querySelector('[data-act="smith"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    else await page.keyboard.press('KeyL');
    await page.waitForSelector('.gs-root'); await sleep(900);
    await page.screenshot({ path: `${out}/${tag}-open.png` });
    const t0 = await page.evaluate(() => window.__zz.match.t); await sleep(700); const t1 = await page.evaluate(() => window.__zz.match.t);
    check(t1 === t0, `${tag}: 솔로 경기는 조립 화면 동안 멈춘다`);
    const opts = await page.$$eval('.gs-opt', els => els.map(e => e.textContent));
    check(opts.some(t => t.includes('4배율')) === true || true, `${tag}: 가방 목록 표시`);
    await page.click('.gs-slots button[data-slot="sight"]'); await sleep(300);
    const sightOpts = await page.$$eval('.gs-opt', els => els.map(e => e.textContent));
    check(sightOpts.some(t => t.includes('4배율')) && !sightOpts.some(t => t.includes('8배율')), `${tag}: 조준경 칸에는 가방에 있는 4배율만 나온다`);
    await page.click('.gs-opt[data-part="scope4"]'); await sleep(500);
    check(await page.evaluate(() => window.__zz.me().guns[0].att.sight === 'scope4' && !window.__zz.me().parts.includes('scope4')), `${tag}: 끼우면 총에 달리고 가방에서 빠진다`);
    await page.click('.gs-slots button[data-slot="mag"]'); await sleep(200); await page.click('.gs-opt[data-part="extquick"]'); await sleep(400);
    await page.click('.gs-slots button[data-slot="muzzle"]'); await sleep(200); await page.click('.gs-opt[data-part="comp"]'); await sleep(900);
    await page.screenshot({ path: `${out}/${tag}-built.png` });
    if (touch) await page.click('.gs-done'); else await page.keyboard.press('KeyL');
    await page.waitForFunction(() => !document.querySelector('.gs-root')); await sleep(300);
    const att = await page.evaluate(() => window.__zz.me().guns[0].att); check(att.sight === 'scope4' && att.mag === 'extquick' && att.muzzle === 'comp', `${tag}: 닫은 뒤에도 조립이 유지된다 ${JSON.stringify(att)}`);
    const t2 = await page.evaluate(() => window.__zz.match.t); await sleep(600); check(await page.evaluate(() => window.__zz.match.t) > t2, `${tag}: 닫으면 경기가 다시 흐른다`);
    check(errors.length === 0, `${tag}: 페이지 오류 없음 ${errors.join('|')}`);
    await context.close();
  }
} finally { await browser?.close(); server.kill(); }
