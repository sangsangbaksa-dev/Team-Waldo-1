import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
// ZERO ZONE 다시 시작: 결과·일시정지 창의 '다시 출격/처음부터'가 새 경기를 열고, 이전 경기의 WebGL 컨텍스트가 끊겨 화면이 멈추지 않는지(페이지 오류 없음) 확인합니다.
const port = 4199, origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) break; } catch {} await sleep(250); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const page = await (await browser.newContext({ viewport: { width: 900, height: 560 } })).newPage(); page.setDefaultTimeout(30000); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/'); await page.click('#start-shooter'); await page.waitForSelector('.sz-setup-inner');
  await page.waitForFunction(() => !document.querySelector('[data-act="start"]')?.disabled, null, { timeout: 90000 });
  await page.click('[data-level="easy"]'); await page.click('[data-act="start"]');
  await page.waitForFunction(() => window.__zz?.phase === 'play' || window.__zz?.phase === 'countdown'); await page.evaluate(() => window.__zz.go()); await page.waitForFunction(() => window.__zz.phase === 'play');
  // 결과·일시정지 창의 버튼과 같은 data-act 를 가진 버튼을 눌러 같은 경로를 탑니다.
  const press = act => page.evaluate(a => { const m = document.querySelector('.sz-modal'); m.className = 'sz-modal show'; m.innerHTML = `<button data-act="${a}">x</button>`; m.querySelector('button').click(); }, act);
  for (const round of [1, 2, 3]) {
    const before = await page.evaluate(() => window.__zz.match.seed);
    if (round === 2) { await page.evaluate(() => { const z = window.__zz; z.match.kill(z.me(), -1, 'zone'); }); await page.waitForFunction(() => window.__zz.phase === 'dead'); }
    await press('again');
    await page.waitForFunction(() => window.__zz.phase === 'countdown' || window.__zz.phase === 'play');
    const after = await page.evaluate(() => ({ seed: window.__zz.match.seed, alive: window.__zz.me().alive, modal: document.querySelector('.sz-modal')?.className }));
    assert.notEqual(after.seed, before, `round ${round}: a new match starts`); assert.ok(after.alive); assert.equal(after.modal, 'sz-modal');
    await page.evaluate(() => window.__zz.go()); await page.waitForFunction(() => window.__zz.phase === 'play');
    const t0 = await page.evaluate(() => window.__zz.match.t); await sleep(2500); assert.ok(await page.evaluate(t => window.__zz.match.t > t, t0), `round ${round}: the new match keeps running (frame loop alive)`);
  }
  assert.deepEqual(errors, []);
  console.log('SHOOTER RESTART SMOKE OK');
} finally { await browser?.close(); server.kill(); }
