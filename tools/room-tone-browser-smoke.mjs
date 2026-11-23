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
      const titleLayout = await page.evaluate(() => {
        const title = document.querySelector("#home h1").getBoundingClientRect();
        const start = document.querySelector("#new").getBoundingClientRect();
        return {
          titleVisible: title.width > 0 && title.height > 0,
          startVisible: start.width >= 40 && start.height >= 40,
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        };
      });
      assert.ok(titleLayout.titleVisible && titleLayout.startVisible, "Home title and start action must be visible");
      assert.equal(titleLayout.horizontalOverflow, false, "Home must not scroll horizontally");
      await page.locator("#new").click();
      await page.getByRole("button", { name: "구역 진입", exact: true }).waitFor();
      await page.getByRole("button", { name: "구역 진입", exact: true }).click();
      await page.locator("#dialog").waitFor({ state: "hidden" });
      await page.locator("#viewWrap canvas").waitFor({ state: "visible" });
      const hasWebgl = await page.locator("#viewWrap canvas").evaluate(canvas=>canvas.width>0&&canvas.height>0&&canvas.getAttribute("data-engine")?.includes("three.js"));
      assert.ok(hasWebgl,"3D renderer must initialize and size the canvas");
      assert.match(await page.locator("#zone").innerText(), /전원 정비동/);
      const hudLayout = await page.evaluate(() => {
        const bySelector = selector => document.querySelector(selector).getBoundingClientRect();
        const overlap = (a, b) => a.left < b.right && b.left < a.right &&
          a.top < b.bottom && b.top < a.bottom;
        const hit = selector => {
          const el = document.querySelector(selector);
          const box = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
        };
        const touch = document.body.classList.contains("touch");
        return {
          pauseClickable: hit("#pauseGame"),
          recorderClickable: hit("#recorder"),
          mapClickable: hit("#mapBtn"),
          cameraTopFree: getComputedStyle(document.querySelector("#game .hud")).pointerEvents === "none",
          controlsClear: !touch || (
            !overlap(bySelector(".statusfoot"), bySelector("#stick")) &&
            !overlap(bySelector(".statusfoot"), bySelector(".gear")) &&
            !overlap(bySelector("#stick"), bySelector(".touchactions")) &&
            !overlap(bySelector(".gear"), bySelector(".touchactions"))
          ),
          widthOk: document.documentElement.scrollWidth <= window.innerWidth + 1,
        };
      });
      assert.ok(hudLayout.pauseClickable && hudLayout.recorderClickable && hudLayout.mapClickable,
        "HUD and gear controls must receive clicks above WebGL: " + JSON.stringify(hudLayout));
      assert.equal(hudLayout.cameraTopFree, true, "HUD container must not block camera look input");
      assert.equal(hudLayout.controlsClear, true, "Mobile control regions must not overlap: " + JSON.stringify(hudLayout));
      assert.equal(hudLayout.widthOk, true, "Game HUD must not overflow horizontally");
      assert.equal(await page.locator("#recorderCount").innerText(),"2/2");
      if (mobile) {
        const hit = await page.locator("#recorder").evaluate(el => {
          const r = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        });
        assert.ok(hit, "Recorder button must receive touches above the game canvas");
        await page.locator("#recorder").click();
      } else {
        await page.keyboard.press("q");
      }
      const remaining = await page.locator("#recorderCount").innerText();
      assert.equal(remaining,"1/2", "Recorder action did not consume a charge: " +
        JSON.stringify({
          toast: await page.locator("#toast").innerText(),
          buttonDisabled: await page.locator("#recorder").isDisabled(),
          focus: await page.evaluate(() => document.activeElement?.id ?? null),
        }));
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("waldo.rt03.campaign.v1")).recorderUsed),1);
      await page.screenshot({ path: out + "/room-tone-play-" + device + ".png" });
      if (mobile) {
        const hit = await page.locator("#pauseGame").evaluate(el => {
          const r = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(r.x + r.width/2, r.y + r.height/2));
        });
        assert.ok(hit, "HUD must receive pointer events above the 3D canvas");
        try {
          await page.locator("#pauseGame").click({timeout:10000});
        } catch (error) {
          const snapshot = await page.evaluate(() => {
            const button = document.getElementById("pauseGame");
            const rect = button.getBoundingClientRect();
            const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
            const ancestors = document.elementsFromPoint(x,y).slice(0,5).map(el => el.tagName.toLowerCase() + "#" + el.id);
            return {
              ancestors,
              parentInert: button.closest("[inert]")?.id ?? null,
              headerEvents: getComputedStyle(button.closest(".hud")).pointerEvents,
              rightEvents: getComputedStyle(button.parentElement).pointerEvents,
              dialogHidden: document.getElementById("dialog").hidden,
              position: { x, y },
            };
          });
          throw new Error("Mobile pause control blocked: " + JSON.stringify(snapshot) + " / " + String(error));
        }
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
