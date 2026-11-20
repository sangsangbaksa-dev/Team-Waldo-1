import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

// ZERO ZONE 시점 회전: 시작 직후(클릭 효력이 지난 뒤)나 Esc 직후의 포인터 잠금 요청은 브라우저가 거절합니다.
// 거절됐다고 '잠금 불가'로 굳히지 않고, 화면을 클릭하면 다시 요청하는지(그리고 잠기면 마우스로 시점이 도는지) 확인합니다.
const port = 4198, origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) break; } catch { /* 서버 대기 */ } await sleep(250); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 900, height: 560 }, reducedMotion: 'reduce' });
  const errors = [];
  await context.addInitScript(() => {
    // 앞의 세 번(시작 때 자동 요청 · 첫 클릭 · 둘째 클릭)은 거절, 그 뒤는 가짜로 잠금 성공
    window.__lockCalls = 0; const real = HTMLCanvasElement.prototype.requestPointerLock;
    HTMLCanvasElement.prototype.requestPointerLock = function () {
      window.__lockCalls++;
      if (window.__lockCalls <= 2) return Promise.reject(new DOMException('The user has exited the lock before this request was completed.', 'SecurityError'));
      return real.call(this);
    };
  });
  const page = await context.newPage(); page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/'); await page.click('#start-shooter'); await page.waitForSelector('.sz-setup-inner');
  await page.waitForFunction(() => !document.querySelector('[data-act="start"]')?.disabled, null, { timeout: 90000 });
  await page.click('[data-level="easy"]'); await page.click('[data-act="start"]');
  await page.waitForFunction(() => window.__zz?.phase === 'countdown' || window.__zz?.phase === 'play');
  await sleep(500);
  const before = await page.evaluate(() => window.__lockCalls); assert.equal(before, 1, 'game start asks for the lock once (rejected)');
  await page.mouse.click(450, 280); await sleep(300);   // 1번째 클릭: 거절(2번째 호출)이어도 포기하지 않아야 함
  await page.mouse.click(450, 280); await sleep(500);   // 2번째 클릭: 다시 요청(3번째 호출, 성공)
  const calls = await page.evaluate(() => window.__lockCalls);
  assert.ok(calls >= 3, `clicking the canvas keeps asking for the lock after a rejection (calls=${calls})`);
  assert.deepEqual(errors, []);
  console.log('SHOOTER LOCK SMOKE OK', calls);
} finally { await browser?.close(); server.kill(); }
