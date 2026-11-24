import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Run against a dev or preview server: node tests/sky-slack-room-tone-layout-smoke.mjs
const base = new URL(process.env.WALDO_URL ?? 'http://localhost:5173/');
const sizes = [
  { width: 1440, height: 900, mobile: false },
  { width: 390, height: 844, mobile: true },
  { width: 320, height: 568, mobile: true },
  { width: 844, height: 390, mobile: true },
];
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

async function box(locator) {
  await locator.waitFor({ state: 'visible' });
  const bounds = await locator.boundingBox();
  assert.ok(bounds, 'missing layout box');
  return bounds;
}
function inside(bounds, viewport, label) {
  const epsilon = 2;
  assert.ok(bounds.x >= -epsilon && bounds.y >= -epsilon &&
    bounds.x + bounds.width <= viewport.width + epsilon &&
    bounds.y + bounds.height <= viewport.height + epsilon,
    label + ' extends outside the viewport');
}
function separate(a, b, label) {
  assert.ok(a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1 ||
    a.y + a.height <= b.y + 1 || b.y + b.height <= a.y + 1, label);
}

try {
  for (const { width, height, mobile } of sizes) {
    const viewport = { width, height };
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
    try {
      const page = await context.newPage();
      await page.goto(base.href);
      await page.locator('#start-sky').click();
      await page.locator('#sk-start').click();
      const flight = page.locator('.sk-hud');
      for (const selector of ['.sk-top', '.sk-bars', '.sk-gauges', '.sk-pause']) {
        inside(await box(flight.locator(selector)), viewport, 'Sky War ' + selector);
      }
      separate(await box(flight.locator('.sk-top')), await box(flight.locator('.sk-bars')), 'Sky War score overlaps bars');
      separate(await box(flight.locator('.sk-top')), await box(flight.locator('.sk-pause')), 'Sky War score overlaps pause');
      if (mobile) {
        const controls = flight.locator('.sk-btns');
        inside(await box(controls), viewport, 'Sky War touch controls');
        separate(await box(controls), await box(flight.locator('.sk-gauges')), 'Sky War controls overlap gauges');
      }

      await page.goto(base.href);
      await page.locator('#start-slack').click();
      await page.locator('[data-start]').click();
      const hud = await box(page.locator('.sl-hud'));
      const stage = await box(page.locator('.sl-view'));
      inside(hud, viewport, 'Slack Off HUD');
      separate(hud, stage, 'Slack Off HUD covers playable stage');
      inside(await box(page.locator('.sl-cover')), viewport, 'Slack Off cover button');
      await page.locator('[data-pause]').click();
      await page.locator('[data-paused]').waitFor({ state: 'visible' });
      await page.locator('[data-resume]').click();
      await page.locator('[data-paused]').waitFor({ state: 'hidden' });
      await page.locator('[data-pause]').click();
      await page.locator('[data-paused] [data-exit]').click();

      await page.goto(new URL('room-tone/', base).href);
      await page.locator('#new').click();
      await page.getByRole('button', { name: '구역 진입', exact: true }).click({ timeout: 60000 });
      const goal = await box(page.locator('.hudleft'));
      const actions = await box(page.locator('.hudright'));
      inside(goal, viewport, 'Room Tone objective');
      inside(actions, viewport, 'Room Tone HUD actions');
      separate(goal, actions, 'Room Tone objective overlaps actions');
      const status = await box(page.locator('.statusfoot'));
      const gear = await box(page.locator('.gear'));
      inside(status, viewport, 'Room Tone status');
      inside(gear, viewport, 'Room Tone gear');
      separate(status, gear, 'Room Tone status overlaps gear');
      if (mobile) {
        inside(await box(page.locator('#stick')), viewport, 'Room Tone movement');
        inside(await box(page.locator('.touchactions')), viewport, 'Room Tone touch actions');
      }
      console.log('layout passed', width, height);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
