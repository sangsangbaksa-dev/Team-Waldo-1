import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

// LAST CITY 멀티플레이 방(3인 영웅 난투전)을 `?pvp=local` 백엔드로 확인합니다: 방 만들기 → 입장 → 준비 → 시작 → 서로의 보스가 보이는지 → 한 명이 나가면 탈락 처리.
const port = 4191, origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; for (const s of [server.stdout, server.stderr]) s.on('data', d => { log += d; });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;
await mkdir('browser-artifacts', { recursive: true });
try {
  let ready = false;
  for (let i = 0; i < 100 && server.exitCode === null; i++) { try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* 서버 대기 */ } await sleep(250); }
  assert.ok(ready, 'vite did not start: ' + log);
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 640, height: 480 }, reducedMotion: 'reduce' });
  const errors = [];
  async function player(name) {
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    await page.goto(origin + '/?pvp=local');
    await page.click('#start-city'); await page.waitForSelector('.c-setup');
    await page.click('[data-act="duel:warlord"]'); await page.waitForSelector('.pvp-card');
    await page.click('[data-act="mode:up"]');
    await page.fill('input[name="nick"]', name); await page.fill('input[name="email"]', `${name}@example.dev`); await page.fill('input[name="password"]', 'secret12');
    await page.click('button[type="submit"]'); await page.waitForSelector('[data-act="newroom"]');
    return page;
  }
  const [a, b, c] = [await player('Alpha'), await player('Beta'), await player('Gamma')];
  await a.click('[data-act="newroom"]'); await a.waitForSelector('select[name="max"]'); await a.selectOption('select[name="max"]', '3'); await a.click('button[type="submit"]');
  await a.waitForSelector('#pvp-code'); const code = (await a.locator('#pvp-code').innerText()).trim();
  await b.waitForSelector('[data-act^="enter:"]'); await b.click('[data-act^="enter:"]'); await b.waitForSelector('.pvp-members');
  await c.fill('input[name="code"]', code.toLowerCase()); await c.click('button:has-text("코드로 입장")'); await c.waitForSelector('.pvp-members');
  await b.click('[data-act="ready"]'); await c.click('[data-act="ready"]');
  await a.waitForSelector('[data-act="start"]:not([disabled])'); await a.click('[data-act="start"]');
  await sleep(15000); await a.screenshot({ path: 'browser-artifacts/dbg-a.png' }); for (const p of [a, b, c]) await p.waitForSelector('#c-zone:has-text("생존")', { timeout: 60000 });
  await sleep(4000);
  const hud = await a.locator('#c-zone').innerText(); assert.match(hud, /생존\s*3\/3명/);
  await a.screenshot({ path: 'browser-artifacts/city-room-a.png' });
  // 한 명이 나가면 나머지에게 탈락으로 보입니다.
  await c.close();
  await a.waitForFunction(() => /생존\s*2\/3명/.test(document.querySelector('#c-zone')?.textContent || ''), null, { timeout: 40000 });
  assert.deepEqual(errors, []);
  console.log('CITY ROOM OK');
} finally { await browser?.close(); server.kill(); }
