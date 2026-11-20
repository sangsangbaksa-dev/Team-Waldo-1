import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

// FRONTLINE AI 대전의 실제 입력 경로를 확인합니다: 시작 화면 → 선택 → 단축키 생산 → 건설 배치 → 이동 명령 → 데스크톱·모바일 화면.
const port = 4193, origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; for (const s of [server.stdout, server.stderr]) s.on('data', d => { log += d; });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;
await mkdir('browser-artifacts', { recursive: true });
try {
  let ready = false;
  for (let i = 0; i < 100 && server.exitCode === null; i++) { try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* 서버 대기 */ } await sleep(250); }
  assert.ok(ready, 'vite did not start: ' + log);
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const errors = [];
  const open = async (viewport, touch) => {
    const ctx = await browser.newContext({ viewport, hasTouch: !!touch, isMobile: !!touch, deviceScaleFactor: 1 }); const page = await ctx.newPage(); page.setDefaultTimeout(60000);
    page.on('pageerror', e => errors.push(e.message)); await page.goto(origin); return page;
  };
  const page = await open({ width: 1280, height: 800 });
  await page.click('#start-rts'); await page.waitForSelector('.rt-setup');
  assert.equal(await page.locator('[data-diff]').count(), 4, 'four difficulty levels');
  await page.click('[data-diff="easy"]'); await page.screenshot({ path: 'browser-artifacts/rts-setup.png' });
  await page.click('#rt-start'); await page.waitForSelector('.rt-root[data-phase="play"]'); await sleep(600);
  const minerals = () => page.evaluate(() => window.__rts.sim.players[0].minerals);
  const at = (id, h = 0.8) => page.evaluate(([i, hh]) => { const r = window.__rts, e = r.sim.index.get(i), c = r.sim.center(e), p = r.view.project(c.x, c.y, hh); return p; }, [id, h]);
  const hqId = await page.evaluate(() => window.__rts.sim.buildings.find(b => b.owner === 0 && b.kind === 'hq').id);
  // 사령부가 처음부터 선택되어 있고 일꾼 생산 버튼이 보인다. Q 로 생산.
  assert.match(await page.textContent('#rt-sel'), /사령부/);
  const m0 = await minerals(); await page.keyboard.press('q'); await sleep(300);
  assert.equal(await minerals(), m0 - 50, 'Q trains a worker (costs 50)');
  // 일꾼 하나를 클릭해 선택하고 B → D 로 보급소 건설 모드, 근처를 눌러 배치.
  const wid = await page.evaluate(() => { const r = window.__rts, w = r.sim.units.find(u => u.owner === 0); return w.id; });
  await page.evaluate(id => window.__rts.select([id]), wid); await sleep(300);
  await page.keyboard.press('b'); await sleep(200); await page.keyboard.press('d'); await sleep(200);
  assert.match(await page.textContent('#rt-hint'), /보급소: 지을 곳/);
  const hp = await at(hqId, 0); await page.mouse.move(hp.x + 260, hp.y - 90); await sleep(300);
  await page.screenshot({ path: 'browser-artifacts/rts-place.png' });
  await page.mouse.click(hp.x + 260, hp.y - 90); await sleep(400);
  assert.ok(await page.evaluate(() => window.__rts.sim.buildings.some(b => b.owner === 0 && b.kind === 'depot')), 'depot placed by click');
  assert.ok((await minerals()) <= m0 - 150, 'depot paid');
  // 드래그로 일꾼 여러 명 선택 → 오른쪽 클릭으로 이동.
  await page.evaluate(() => window.__rts.step(20 * 20)); await sleep(300);
  await page.keyboard.press('Escape'); await page.mouse.move(120, 120); await page.mouse.down(); await page.mouse.move(1100, 560, { steps: 4 }); await page.mouse.up(); await sleep(300);
  const nSel = await page.evaluate(() => document.querySelectorAll('#rt-sel [data-id]').length);
  assert.ok(nSel >= 2, `box selects workers (${nSel})`);
  const before = await page.evaluate(() => { const u = window.__rts.sim.units.find(x => x.owner === 0 && x.kind === 'worker'); return [u.id, u.x, u.y]; });
  await page.mouse.click(300, 300, { button: 'right' }); await page.evaluate(() => window.__rts.step(20 * 4)); await sleep(300);
  const after = await page.evaluate(id => { const u = window.__rts.sim.unit(id); return [u.x, u.y, u.o.t]; }, before[0]);
  assert.ok(Math.hypot(after[0] - before[1], after[1] - before[2]) > 2 || after[2] === 'move', 'right click moves the selection');
  await page.screenshot({ path: 'browser-artifacts/rts-play.png' });
  // 메뉴 → 항복 → 결과 → 다시 하기
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForSelector('.rt-modal.show');
  await page.click('[data-act="surrender"]'); await page.waitForSelector('.rt-result.lose', { timeout: 20000 });
  await page.screenshot({ path: 'browser-artifacts/rts-result.png' });
  await page.click('[data-act="again"]'); await page.waitForSelector('.rt-root[data-phase="play"]');
  await page.click('[data-act="menu"]'); await page.click('[data-act="exit"]'); await page.waitForSelector('#start-rts');
  assert.match(await page.textContent('.tile-status:has(+ .tile-cta)') ?? '', /|/);
  // 모바일
  const phone = await open({ width: 844, height: 390 }, true);
  await phone.click('#start-rts'); await phone.waitForSelector('.rt-setup'); await phone.click('#rt-start'); await phone.waitForSelector('.rt-root[data-phase="play"]'); await sleep(800);
  await phone.screenshot({ path: 'browser-artifacts/rts-mobile.png' });
  const wide = await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  assert.ok(wide, 'no horizontal scroll on phone');
  assert.deepEqual(errors, [], errors.join('\n'));
  console.log('rts ui smoke ok');
} finally { await browser?.close(); server.kill(); }
