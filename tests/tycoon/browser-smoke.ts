// Optional real-browser acceptance check. Runs only in the HUSTLE smoke workflow.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import { createServer } from 'vite';

type TestDebug = {
  player: { teleport(x: number, z: number, yaw: number): void };
  rides: {
    driving: boolean;
    speed: number;
    positions(): Array<{ x: number; z: number; heading: number; name: string }>;
  } | null;
};
const getDebug = async (page: Page): Promise<{ cars: number; driving: boolean }> => page.evaluate(() => {
  const debug = (window as unknown as { __ty?: TestDebug }).__ty;
  return { cars: debug?.rides?.positions().length ?? 0, driving: !!debug?.rides?.driving };
});

async function startGame(page: Page): Promise<void> {
  await page.goto('http://127.0.0.1:4174/', { waitUntil: 'domcontentloaded' });
  await page.locator('#start-tycoon').click();
  await page.locator('.ty-titlebox h1').waitFor({ state: 'visible', timeout: 90_000 });
  const title = await page.locator('.ty-titlebox h1').textContent();
  assert.equal(title, 'HUSTLE');
  await page.locator('[data-title="new"]').click();
  await page.locator('#ty-hud').waitFor({ state: 'visible', timeout: 35_000 });
  const cars = (await getDebug(page)).cars;
  assert.ok(cars >= 5, 'At least five parked cars should spawn');
}

async function approachFirstCar(page: Page): Promise<void> {
  const ok = await page.evaluate(() => {
    const debug = (window as unknown as { __ty?: TestDebug }).__ty;
    const car = debug?.rides?.positions()[0];
    if (!car || !debug) return false;
    debug.player.teleport(car.x + 0.2, car.z + 0.2, car.heading);
    return true;
  });
  assert.ok(ok, 'Dev-only ride and player inspectors must exist');
}

async function main(): Promise<void> {
  const vite = await createServer({ server: { host: '127.0.0.1', port: 4174, strictPort: true }, logLevel: 'error' });
  await vite.listen();
  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
  });
  await mkdir('artifacts', { recursive: true });
  const errors: string[] = [];
  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    desktop.on('pageerror', e => errors.push('Desktop: ' + e.message));
    await startGame(desktop);
    await approachFirstCar(desktop);
    await desktop.keyboard.press('f');
    assert.equal((await getDebug(desktop)).driving, true, 'F must enter the car');
    await desktop.keyboard.down('w');
    await desktop.waitForTimeout(650);
    await desktop.keyboard.up('w');
    await desktop.locator('#ty-drive').waitFor({ state: 'visible' });
    await desktop.screenshot({ path: 'artifacts/hustle-desktop-drive.png', fullPage: false });
    await desktop.keyboard.press('m');
    await desktop.locator('#ty-bigmap').waitFor({ state: 'visible' });
    assert.ok(await desktop.locator('.ty-map-vehicle').count() >= 5, 'Vehicle directory should be populated');
    await desktop.screenshot({ path: 'artifacts/hustle-desktop-map.png', fullPage: false });
    await desktop.locator('.ty-map-vehicle:not([disabled])').first().click();
    await desktop.waitForTimeout(350);
    const activeRoute = await desktop.locator('#ty-route').isVisible();
    const routeToast = await desktop.locator('#ty-toasts').textContent();
    assert.ok(activeRoute || routeToast?.includes('목적지에 도착'), 'Map selection must show a route or recognize immediate arrival');
    await desktop.locator('#ty-b-menu').click();
    await desktop.locator('[data-menu="save"]').click();
    assert.ok((await desktop.locator('#ty-toasts').textContent())?.includes('저장했습니다'), 'Save toast must confirm');
    await desktop.close();

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    mobile.on('pageerror', e => errors.push('Mobile: ' + e.message));
    await startGame(mobile);
    await approachFirstCar(mobile);
    const ride = mobile.locator('#ty-t-ride');
    await mobile.waitForFunction(() => {
      const el = document.getElementById('ty-t-ride');
      return el instanceof HTMLButtonElement && !el.disabled;
    });
    await ride.tap();
    assert.equal((await getDebug(mobile)).driving, true, 'Tap must enter vehicle');
    const brake = mobile.locator('#ty-t-run');
    await brake.dispatchEvent('pointerdown', { pointerId: 121, pointerType: 'touch' });
    assert.ok(await brake.evaluate(el => el.classList.contains('on')), 'Brake press should have feedback');
    await mobile.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 121, pointerType: 'touch' })));
    assert.equal(await brake.evaluate(el => el.classList.contains('on')), false, 'Brake must release on pointerup');
    await mobile.screenshot({ path: 'artifacts/hustle-mobile-drive.png', fullPage: false });
    await mobile.locator('#ty-b-map').tap();
    await mobile.locator('#ty-bigmap').waitFor({ state: 'visible' });
    await mobile.screenshot({ path: 'artifacts/hustle-mobile-map.png', fullPage: false });
    assert.ok((await mobile.locator('.ty-map-vehicle').count()) >= 5);
    await mobile.close();

    assert.deepEqual(errors, [], 'Unexpected page exceptions');
    console.log('HUSTLE browser acceptance passed: desktop driving/map/save; mobile ride/brake/map');
  } finally {
    await browser.close();
    await vite.close();
  }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
