import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const origin = "http://127.0.0.1:4194";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4194", "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
let log = "";
server.stdout.on("data", chunk => { log += chunk; });
server.stderr.on("data", chunk => { log += chunk; });
server.on("error", error => { log += error.message; });
const results = [];
const out = "browser-artifacts";
let browser;
await mkdir(out, { recursive: true });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) break;
    try { if ((await fetch(origin + "/room-tone/")).ok) { ready = true; break; } } catch { /* Server starting. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, "Room Tone server did not start: " + log);
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-dev-shm-usage"] });
  for (const device of ["desktop", "mobile"]) {
    const mobile = device === "mobile";
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce" });
    await context.addInitScript(() => { localStorage.setItem("rt-silent", "true"); });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.goto(origin + "/room-tone/", { waitUntil: "domcontentloaded" });
      await page.locator("#new").click();
      await page.getByRole("button", { name: "구역 진입", exact: true }).waitFor();
      await page.getByRole("button", { name: "구역 진입", exact: true }).click();
      await page.locator("#dialog").waitFor({ state: "hidden" });
      await page.locator("#viewWrap canvas").waitFor({ state: "visible" });
      assert.match(await page.locator("#zone").innerText(), /전원 정비동/);
      await page.screenshot({ path: out + "/room-tone-play-" + device + ".png" });
      if (mobile) {
        const hit = await page.locator("#pauseGame").evaluate(el => {
          const r = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(r.x + r.width/2, r.y + r.height/2));
        });
        assert.ok(hit, "HUD must receive pointer events above the 3D canvas");
        await page.locator("#pauseGame").click();
      }
      else await page.keyboard.press("p");
      await page.getByRole("button", { name: "조작 설정", exact: true }).click();
      const range = page.getByRole("slider", { name: "시점 감도" });
      await range.focus();
      await range.press("End");
      assert.equal(await range.inputValue(), "200");
      await page.getByRole("checkbox", { name: "카메라 흔들림 및 밝기 변화" }).uncheck();
      assert.equal(await page.locator("#viewWrap").getAttribute("data-motion"), "reduced");
      await page.screenshot({ path: out + "/room-tone-settings-" + device + ".png" });
      await page.getByRole("button", { name: "돌아가기", exact: true }).click();
      await page.getByRole("button", { name: "타이틀로", exact: true }).click();
      await page.locator("#continue").waitFor({ state: "visible" });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator("#continue").waitFor({ state: "visible" });
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("rt-controls"))), { sensitivity: 2, cameraMotion: false });
      // Seed a legitimate checkpoint to reach puzzle UI without traversing the maze.
      await page.evaluate(ch => {
        localStorage.setItem("waldo.rt03.campaign.v1", JSON.stringify({
          v: 1, ch, found: [true,true,true], solved: false, seen: [], elapsed: 60, archive: [],
        }));
      }, mobile ? 2 : 1);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator("#continue").click();
      await page.getByRole("button", { name: "구역 진입", exact: true }).click();
      await page.locator("#dialog").waitFor({ state: "hidden" });
      await page.locator("#prompt").waitFor({ state: "visible" });
      await page.screenshot({ path: out + "/room-tone-wing-" + (mobile ? "archive" : "radio") + ".png" });
      if (mobile) await page.locator("#act").click();
      else await page.keyboard.press("e");
      const confirm = page.getByRole("button", { name: "신호 확인", exact: true });
      await confirm.waitFor();
      if (mobile) {
        assert.equal(await confirm.isEnabled(), false);
        await page.locator(".choiceRow button").nth(1).click();
        await page.locator(".choiceRow button").nth(2).click();
        await page.getByRole("button", { name: "마지막 선택 취소" }).click();
        assert.equal(await page.locator(".choiceRow button").nth(2).isEnabled(), true);
        await page.locator(".choiceRow button").nth(2).click();
        await page.locator(".choiceRow button").nth(0).click();
      } else {
        const values = page.locator(".dial-value");
        await page.locator(".dial-prev").nth(0).click();
        assert.match(await values.nth(0).innerText(), /74.8/);
        await values.nth(0).click();
        await values.nth(0).click();
        await page.locator(".dial-prev").nth(1).click();
        await values.nth(2).click();
      }
      await page.screenshot({ path: out + "/room-tone-puzzle-" + device + ".png" });
      await confirm.click();
      await page.locator("#dialog").waitFor({ state: "hidden" });
      assert.match(await page.locator("#objective").innerText(), /출구 단말기/);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("waldo.rt03.campaign.v1")).solved), true);
      assert.deepEqual(errors, [], "Unexpected browser errors");
      results.push({ device, status: "passed", puzzle: mobile ? "reel" : "frequency" });
    } catch (error) {
      process.exitCode = 1;
      results.push({ device, status: "failed", error: String(error), pageErrors: errors });
      await page.screenshot({ path: out + "/room-tone-failure-" + device + ".png" }).catch(() => {});
    } finally { await context.close(); }
  }
} catch (error) {
  process.exitCode = 1;
  results.push({ status: "failed", error: String(error) });
} finally {
  await writeFile(out + "/room-tone-report.json", JSON.stringify(results, null, 2));
  await browser?.close().catch(() => {});
  server.kill("SIGTERM");
  console.log(JSON.stringify(results, null, 2));
}
