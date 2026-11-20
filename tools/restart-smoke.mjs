// 결과 화면의 '다시 달리기'(SPEED RUSH)·'다시 도전'/'새 게임'(LAST CITY) 버튼이 실제로 새 판을 시작하는지 확인합니다.
// node tools/restart-smoke.mjs  (CHROMIUM_PATH 로 브라우저 경로 지정 가능)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const port = 5207, origin = `http://127.0.0.1:${port}/`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) break; } catch { /* wait */ } await sleep(250); }
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  // SPEED RUSH: 1랩을 감아서 끝낸 뒤 결과 화면의 다시 달리기
  for (const mode of ['race', 'knockout', 'trial']) {
    const page = await (await browser.newContext({ viewport: { width: 1100, height: 640 } })).newPage(); page.setDefaultTimeout(90000);
    page.on('pageerror', e => errors.push(`race/${mode}: ${e.message}`));
    await page.addInitScript(m => localStorage.setItem('waldo.race.setup.v1', JSON.stringify({ map: 'sunset', laps: 1, level: 1, car: 'arc', skin: 'stock', mode: m })), mode);
    await page.goto(origin); await page.locator('#start-race').click(); await page.locator('[data-setup="start"]').click();
    await page.waitForFunction(() => document.querySelector('.rc-root')?.dataset.phase === 'countdown');
    // 녹아웃에서는 출발하지 않고 탈락, 나머지는 자동 주행으로 완주
    await page.evaluate(m => { const r = window.__race; r.dbg.auto = m !== 'knockout'; r.skip(m === 'knockout' ? 200 : 260); }, mode);
    await page.locator('.rc-modal.show [data-act="restart"]').waitFor();
    const before = await page.evaluate(() => window.__race.race);
    await page.locator('.rc-modal.show [data-act="restart"]').click();
    await page.waitForFunction(() => document.querySelector('.rc-root')?.dataset.phase === 'countdown');
    const after = await page.evaluate(() => ({ clock: window.__race.race.clock, phase: window.__race.race.phase, laps: window.__race.race.player.lapTimes.length }));
    assert.notEqual(before, null); assert.ok(after.clock < 0.5, `race/${mode} restart clock ${after.clock}`); assert.equal(after.laps, 0);
    assert.equal(await page.locator('.rc-modal.show').count(), 0, `race/${mode}: result card still open`);
    console.log(`race/${mode}: restart ok`, after);
    await page.close();
  }
  // LAST CITY: 일시정지 → 새 게임, 패배 → 다시 도전
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 640 } })).newPage(); page.setDefaultTimeout(90000);
  page.on('pageerror', e => errors.push(`city: ${e.message}`));
  await page.goto(origin); await page.locator('#start-city').click(); await page.locator('.c-setup').waitFor();
  await page.locator('[data-act="class:warlord"]').click(); await page.locator('.city-hud').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !!window.__city?.world);
  const w1 = await page.evaluate(() => { window.__w1 = window.__city.world; return window.__city.world.time ?? 0; });
  await page.keyboard.press('Escape'); await sleep(300);
  if (!(await page.locator('[data-act="retry"]').count())) await page.locator('[data-act="pause"]').first().click();
  await page.locator('[data-act="retry"]').click();
  await page.waitForFunction(() => window.__city.world !== window.__w1);
  console.log('city: pause → 새 게임 ok', w1);
  await page.evaluate(() => { window.__w2 = window.__city.world; const w = window.__city.world, b = w.boss(0); b.hp = 0; w.lives = 0; });
  // 패배 처리는 게임 루프가 하므로 world 쪽 패배 함수를 찾아 호출합니다.
  await page.evaluate(() => { const w = window.__city.world; if (typeof w.defeat === 'function') w.defeat(0); else { w.over = true; w.winner = 1; } });
  const retry = page.locator('[data-act="retry"]');
  await retry.waitFor({ timeout: 30000 });
  await retry.click();
  await page.waitForFunction(() => window.__city.world !== window.__w2 && !window.__city.world.over);
  assert.equal(await page.locator('.c-result').count(), 0, 'city: result still shown');
  console.log('city: 결과 → 다시 도전 ok');
  await page.close();
} finally { await browser.close(); server.kill(); }
console.log('errors', errors); if (errors.length) process.exitCode = 1;
