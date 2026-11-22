import { chromium } from "playwright";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

// Independent real-browser coverage for ROOM TONE; does not deploy anything.
const port=4192, origin="http://127.0.0.1:"+port;
const server=spawn(process.execPath,["node_modules/vite/bin/vite.js","--host","127.0.0.1","--port",String(port),"--strictPort"],{
  cwd:process.cwd(),stdio:["ignore","pipe","pipe"]
});
let serverLog="";
for(const stream of [server.stdout,server.stderr])stream.on("data",data=>{serverLog+=data;});
server.on("error",error=>{serverLog+=String(error);});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const results=[];
let browser;
await mkdir("browser-artifacts",{recursive:true});
try {
  let ready=false;
  for(let i=0;i<120;i++){
    if(server.exitCode!==null)break;
    try{if((await fetch(origin+"/room-tone/")).ok){ready=true;break;}}catch{/* Startup */}
    await sleep(250);
  }
  assert.ok(ready,"Vite did not start: "+serverLog);
  browser=await chromium.launch({
    headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,
    args:["--no-sandbox","--enable-webgl","--use-gl=angle","--use-angle=swiftshader",
      "--enable-unsafe-swiftshader","--disable-dev-shm-usage"],
  });
  for(const config of [
    {name:"desktop",width:1280,height:800,mobile:false},
    {name:"mobile",width:390,height:844,mobile:true},
    {name:"mobile-compact",width:320,height:640,mobile:true},
  ]){
    const context=await browser.newContext({
      viewport:{width:config.width,height:config.height},
      isMobile:config.mobile,hasTouch:config.mobile,reducedMotion:"reduce",
    });
    await context.addInitScript(()=>{
      localStorage.setItem("waldo.preferences.v1",JSON.stringify({sound:false,quality:"low"}));
    });
    const page=await context.newPage();
    page.setDefaultTimeout(30000);
    const errors=[],glb=[];
    page.on("pageerror",error=>errors.push(error.message));
    page.on("request",request=>{
      if(request.url().includes("room-tone.glb"))glb.push(request.url());
    });
    try {
      await page.goto(origin+"/room-tone/",{waitUntil:"domcontentloaded"});
      await page.locator("#new").waitFor({state:"visible"});
      assert.equal(await page.locator("#home").isVisible(),true);
      assert.equal(await page.locator("#game").isVisible(),false);
      assert.equal(glb.length,0,"GLB should not load on the title screen");
      assert.equal(await page.locator(".mast .wordmark").getAttribute("href"),"../");
      await page.screenshot({path:"browser-artifacts/room-tone-title-"+config.name+".png",animations:"disabled"});

      await page.locator("#sound").click();
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("waldo.preferences.v1")).sound),true);
      await page.locator("#sound").click();
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("waldo.preferences.v1")).sound),false);

      await page.locator("#new").click();
      await page.waitForFunction(()=>{
        const title=document.querySelector("#panelTitle")?.textContent||"";
        return title.includes("끊어진 전원")||title.includes("게임을 열 수 없습니다");
      },null,{timeout:90000});
      assert.match(await page.locator("#panelTitle").innerText(),/끊어진 전원/);
      assert.ok(glb.length>0,"Starting the game must request the monster model");
      assert.equal(await page.locator("#viewWrap canvas").evaluate(el=>
        el.width>0 && el.height>0 && Boolean(el.getContext("webgl2"))),true);
      await page.screenshot({path:"browser-artifacts/room-tone-brief-"+config.name+".png",animations:"disabled"});

      await page.getByRole("button",{name:"도면 보기"}).click();
      assert.match(await page.locator("#panelTitle").innerText(),/시설 도면/);
      await page.locator(".map-guide").click();
      assert.equal(await page.locator(".map-guide").getAttribute("aria-pressed"),"true");
      await page.getByRole("button",{name:"닫기"}).click();
      assert.match(await page.locator("#panelTitle").innerText(),/끊어진 전원/);
      await page.getByRole("button",{name:"구역 진입"}).click();
      assert.equal(await page.locator("#dialog").isVisible(),false);
      if(config.mobile) {
        for (const id of ["#gsound","#mapBtn","#pauseGame","#crouch","#torch","#run","#act"]) {
          const box=await page.locator(id).boundingBox();
          assert.ok(box && box.width>=40 && box.height>=40,
            id+" touch target must be at least 40x40 px");
        }
        const left=await page.locator(".hudleft").boundingBox();
        const right=await page.locator(".hudright").boundingBox();
        assert.ok(left && right && left.x+left.width <= right.x+2,
          "Mobile HUD text must not overlap the control group");
      }

      if(config.mobile){
        assert.equal(await page.evaluate(()=>Boolean(document.pointerLockElement)),false);
        await page.locator("#pauseGame").tap();
      } else await page.locator("#pauseGame").click();
      assert.match(await page.locator("#panelTitle").innerText(),/일시정지/);
      assert.ok(await page.getByRole("button",{name:"게임 목록으로"}).count()>0);
      await page.screenshot({path:"browser-artifacts/room-tone-paused-"+config.name+".png",animations:"disabled"});
      await page.getByRole("button",{name:"계속하기"}).click();
      assert.equal(await page.locator("#dialog").isVisible(),false);
      if(config.mobile)await page.locator("#mapBtn").tap();
      else await page.locator("#mapBtn").click();
      assert.match(await page.locator("#panelTitle").innerText(),/시설 도면/);
      await page.getByRole("button",{name:"닫기"}).click();
      assert.equal(await page.locator("#dialog").isVisible(),false);
      assert.deepEqual(errors,[],"Unexpected browser exceptions");
      await page.screenshot({path:"browser-artifacts/room-tone-playing-"+config.name+".png",animations:"disabled"});
      results.push({device:config.name,status:"passed",modelRequests:glb.length});
      console.log("PASS ROOM TONE "+config.name);
    } catch(error) {
      process.exitCode=1;
      results.push({device:config.name,status:"failed",error:String(error.stack||error),
        errors,modelRequests:glb.length,serverLog:serverLog.slice(-800)});
      console.error("FAIL ROOM TONE "+config.name,error);
      await page.screenshot({path:"browser-artifacts/room-tone-failure-"+config.name+".png"}).catch(()=>undefined);
    } finally {
      await context.close();
    }
  }
} catch(error) {
  process.exitCode=1;
  results.push({device:"setup",status:"failed",error:String(error.stack||error)});
  console.error("FAIL ROOM TONE setup",error);
} finally {
  await writeFile("browser-artifacts/room-tone-report.json",JSON.stringify(results,null,2));
  await browser?.close().catch(()=>undefined);
  server.kill("SIGTERM");
}
