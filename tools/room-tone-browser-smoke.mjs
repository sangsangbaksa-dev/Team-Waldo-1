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
    {name:"mobile-landscape",width:844,height:390,mobile:true},
  ]){
    const context=await browser.newContext({
      viewport:{width:config.width,height:config.height},
      isMobile:config.mobile,hasTouch:config.mobile,reducedMotion:config.mobile?"reduce":"no-preference",
    });
    await context.addInitScript(()=>{
      localStorage.setItem("waldo.preferences.v1",JSON.stringify({sound:false,quality:"low",reducedMotion:true}));
    });
    const page=await context.newPage();
    page.setDefaultTimeout(30000);
    const errors=[],shaderErrors=[],glb=[];
    page.on("console",message=>{
      if(message.type()==="error" && /(?:WebGLProgram|VALIDATE_STATUS|shader error)/i.test(message.text()))
        shaderErrors.push(message.text());
    });
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
      if(config.width<=420) {
        const brand=await page.locator(".mast .wordmark").boundingBox();
        const sound=await page.locator(".mast .bare").boundingBox();
        assert.ok(brand && sound && brand.height<=36 &&
          brand.x+brand.width<=sound.x+1 && sound.x+sound.width<=config.width+1,
          "Compact title header must fit in one row without clipping the sound control");
      }
      assert.equal(await page.evaluate(()=>document.body.classList.contains("rt-reduced-motion")),true,
        "The hub reduced-motion setting must control ROOM TONE animations");
      if(!config.mobile){
        await page.evaluate(()=>{
          const prefs=JSON.parse(localStorage.getItem("waldo.preferences.v1"));
          localStorage.setItem("waldo.preferences.v1",JSON.stringify({...prefs,reducedMotion:false}));
          window.dispatchEvent(new StorageEvent("storage",{key:"waldo.preferences.v1"}));
        });
        assert.equal(await page.evaluate(()=>document.body.classList.contains("rt-reduced-motion")),false,
          "Desktop users with no OS motion reduction may re-enable effects");
      }
      await page.screenshot({path:"browser-artifacts/room-tone-title-"+config.name+".png",animations:"disabled"});

      await page.locator("#sound").click();
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("waldo.preferences.v1")).sound),true);
      await page.locator("#sound").click();
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("waldo.preferences.v1")).sound),false);

      if(config.name==="desktop"){
        let failures=0;
        await page.route("**/room-tone.glb",async route=>{
          if(failures++===0) await route.fulfill({status:503,body:""});
          else await route.continue();
        });
      }
      await page.locator("#new").click();
      if(config.name==="desktop"){
        await page.waitForFunction(()=>
          document.querySelector("#panelTitle")?.textContent?.includes("파일을 불러오지 못했습니다"),
          null,{timeout:90000});
        assert.ok(await page.getByRole("button",{name:"다시 시도"}).isVisible(),
          "Failed GLB requests must offer an actionable retry");
        await page.getByRole("button",{name:"다시 시도"}).click();
      }
      await page.waitForFunction(()=>{
        const title=document.querySelector("#panelTitle")?.textContent||"";
        return title.includes("끊어진 전원")||title.includes("게임을 열 수 없습니다");
      },null,{timeout:90000});
      assert.match(await page.locator("#panelTitle").innerText(),/끊어진 전원/);
      assert.ok(glb.length>0,"Starting the game must request the monster model");
      assert.equal(await page.locator("#viewWrap canvas").evaluate(el=>
        el.width>0 && el.height>0 && Boolean(el.getContext("webgl2"))),true);
      const lowPixels=await page.locator("#viewWrap canvas").evaluate(el=>el.width*el.height);
      assert.ok(lowPixels>0 && lowPixels<=680000,
        "Low-quality setting should keep the WebGL drawing buffer below 680k pixels");
      if(!config.mobile){
        await page.evaluate(()=>{
          const config=JSON.parse(localStorage.getItem("waldo.preferences.v1"));
          localStorage.setItem("waldo.preferences.v1",JSON.stringify({...config,quality:"high"}));
          window.dispatchEvent(new StorageEvent("storage",{key:"waldo.preferences.v1"}));
        });
        await page.waitForFunction((low)=> {
          const canvas=document.querySelector("#viewWrap canvas");
          return canvas && canvas.width*canvas.height>low;
        },lowPixels,{timeout:10000});
      }
      await page.screenshot({path:"browser-artifacts/room-tone-brief-"+config.name+".png",animations:"disabled"});

      await page.getByRole("button",{name:"도면 보기"}).click();
      assert.match(await page.locator("#panelTitle").innerText(),/시설 도면/);
      await page.locator(".map-guide").click();
      assert.equal(await page.locator(".map-guide").getAttribute("aria-pressed"),"true");
      await page.getByRole("button",{name:"닫기"}).click();
      assert.match(await page.locator("#panelTitle").innerText(),/끊어진 전원/);
      await page.getByRole("button",{name:"구역 진입"}).click();
      assert.equal(await page.locator("#dialog").isVisible(),false);
      assert.equal(await page.locator("#torch").getAttribute("aria-pressed"),"true",
        "The flashlight should expose its initial on state to screen readers");
      await page.locator("#torch").click();
      assert.equal(await page.locator("#torch").getAttribute("aria-pressed"),"false");
      await page.locator("#torch").click();
      assert.equal(await page.locator("#torch").getAttribute("aria-pressed"),"true");
      if(config.name==="desktop"){
        const churn=await page.evaluate(async()=>{
          const stamina=document.querySelector("#stamina");
          const strain=document.querySelector("#strain");
          const prompt=document.querySelector("#prompt");
          const arrow=document.querySelector("#guideArrow");
          let count=0;
          const observer=new MutationObserver(records=>{count+=records.length;});
          observer.observe(stamina,{attributes:true,attributeFilter:["style"]});
          observer.observe(strain,{characterData:true,childList:true,subtree:true});
          observer.observe(prompt,{attributes:true,attributeFilter:["hidden"]});
          observer.observe(arrow,{attributes:true,attributeFilter:["hidden"]});
          await new Promise(resolve=>setTimeout(resolve,300));
          observer.disconnect();
          return count;
        });
        assert.equal(churn,0,
          "An idle, full-stamina HUD should not rewrite the same DOM values each frame");
      }
      const firstTime=await page.locator("#timer").textContent();
      // Shader compilation can consume several seconds of CPU on software
      // WebGL. Poll for a clock change instead of relying on a 1.5s sleep.
      await page.waitForFunction((start) => {
        const current=document.querySelector("#timer")?.textContent;
        return current && current!==start;
      },firstTime,{timeout:12000,polling:250});
      if(config.name==="mobile"){
        const stickBox=await page.locator("#stick").boundingBox();
        const runBox=await page.locator("#run").boundingBox();
        assert.ok(stickBox && runBox,"Mobile joystick and sprint button must be visible");
        const center={x:stickBox.x+stickBox.width/2,y:stickBox.y+stickBox.height/2,id:1};
        const moved={...center,y:center.y-35};
        const run={x:runBox.x+runBox.width/2,y:runBox.y+runBox.height/2,id:2};
        const cdp=await context.newCDPSession(page);
        const touch=(type,points)=>cdp.send("Input.dispatchTouchEvent",{type,touchPoints:points});
        try {
          await touch("touchStart",[center]);
          await touch("touchMove",[moved]);
          await page.waitForFunction(()=>
            document.querySelector("#stickknob")?.style.transform?.includes("translate("));
          await touch("touchStart",[moved,run]);
          await page.waitForFunction(()=>
            document.querySelector("#run")?.getAttribute("aria-pressed")==="true");
          // CDP touchEnd's touchPoints semantics vary for partial finger
          // releases. End the whole gesture here; isolated owner cleanup for
          // a non-owning pointer is separately covered by the unit tests.
          await touch("touchEnd",[]);
          await page.waitForFunction(()=>
            document.querySelector("#stickknob")?.style.transform==="" &&
            document.querySelector("#run")?.getAttribute("aria-pressed")==="false");
        } finally {
          await touch("touchEnd",[]).catch(()=>{});
          await cdp.detach().catch(()=>{});
        }
      }
      if(config.mobile) {
        for (const id of ["#gsound","#mapBtn","#pauseGame","#crouch","#torch","#run","#act"]) {
          const box=await page.locator(id).boundingBox();
          assert.ok(box && box.width>=40 && box.height>=40,
            id+" touch target must be at least 40x40 px");
        }
        const left=await page.locator(".hudleft").boundingBox();
        const right=await page.locator(".hudright").boundingBox();
        if(config.width <= 359) {
          assert.ok(left && right && left.y >= right.y+right.height-2,
            "Narrow HUD information must stack below the button row");
          assert.ok(left.height < 105,
            "Narrow HUD must not grow into a tall text column");
        } else {
          assert.ok(left && right && left.x+left.width <= right.x+2,
            "Mobile HUD text must not overlap the control group");
        }
      }

      if(config.mobile){
        assert.equal(await page.evaluate(()=>Boolean(document.pointerLockElement)),false);
        await page.locator("#pauseGame").tap();
      } else await page.locator("#pauseGame").click();
      assert.match(await page.locator("#panelTitle").innerText(),/일시정지/);
      assert.ok(await page.getByRole("button",{name:"게임 목록으로"}).count()>0);
      if(!config.mobile){
        await page.keyboard.press("Shift+Tab");
        assert.equal(await page.evaluate(()=>document.activeElement?.textContent?.trim()),
          "게임 목록으로","Shift+Tab must wrap to the last modal action");
        await page.keyboard.press("Tab");
        assert.equal(await page.evaluate(()=>document.activeElement?.textContent?.trim()),
          "계속하기","Tab must wrap to the first modal action");
      }
      const stoppedTime=await page.locator("#timer").textContent();
      await page.waitForTimeout(350);
      assert.equal(await page.locator("#timer").textContent(),stoppedTime,
        "The game clock must not advance during pause");
      await page.screenshot({path:"browser-artifacts/room-tone-paused-"+config.name+".png",animations:"disabled"});
      await page.getByRole("button",{name:"계속하기"}).click();
      assert.equal(await page.locator("#dialog").isVisible(),false);
      if(config.mobile)await page.locator("#mapBtn").tap();
      else await page.locator("#mapBtn").click();
      assert.match(await page.locator("#panelTitle").innerText(),/시설 도면/);
      await page.getByRole("button",{name:"닫기"}).click();
      assert.equal(await page.locator("#dialog").isVisible(),false);
      if(config.name==="desktop"){
        // Return to title and resume the saved chapter using the same WebGL
        // renderer and monster scene. This covers disposal/re-entry regressions.
        const modelDownloads=glb.length;
        await page.locator("#pauseGame").click();
        await page.getByRole("button",{name:"타이틀로"}).click();
        await page.locator("#continue").waitFor({state:"visible"});
        await page.locator("#continue").click();
        await page.waitForFunction(()=>
          document.querySelector("#panelTitle")?.textContent?.includes("끊어진 전원"),null,{timeout:90000});
        assert.equal(await page.locator("#viewWrap canvas").count(),1,
          "Returning to ROOM TONE must reuse the existing WebGL canvas");
        assert.equal(glb.length,modelDownloads,
          "Resuming from title should not download the monster a second time");
        // Pagehide persists the live session before the renderer/audio context
        // is torn down. The next page must offer a valid Continue action.
        await page.getByRole("button",{name:"구역 진입"}).click();
        const priorClock=await page.locator("#timer").textContent();
        await page.waitForFunction(start=>
          document.querySelector("#timer")?.textContent!==start,
          priorClock,{timeout:12000,polling:250});
        const live=await page.evaluate(()=>
          JSON.parse(localStorage.getItem("waldo.rt03.campaign.v1")));
        await page.reload({waitUntil:"domcontentloaded"});
        await page.locator("#continue").waitFor({state:"visible"});
        const afterPagehide=await page.evaluate(()=>
          JSON.parse(localStorage.getItem("waldo.rt03.campaign.v1")));
        assert.ok(afterPagehide?.elapsed>=live.elapsed,
          "Leaving an active game must persist elapsed time");
        await page.locator("#new").click();
        assert.equal(await page.locator("#restartAsk").isVisible(),true,
          "A saved game requires confirmation before reset");
        await page.locator("#cancelReset").click();
        assert.equal(await page.locator("#restartAsk").isVisible(),false,
          "Cancel should preserve the existing campaign");
        assert.ok(await page.locator("#continue").isVisible());
        await page.locator("#new").click();
        await page.locator("#confirmReset").click();
        await page.waitForFunction(()=>
          document.querySelector("#panelTitle")?.textContent?.includes("끊어진 전원"),
          null,{timeout:90000});
        const restarted=await page.evaluate(()=>
          JSON.parse(localStorage.getItem("waldo.rt03.campaign.v1")));
        assert.equal(restarted?.elapsed,0,"A confirmed new game resets play time");
        assert.deepEqual(restarted?.found,[false,false,false],
          "A confirmed new game resets collected items");
      }
      assert.deepEqual(errors,[],"Unexpected browser exceptions");
      assert.deepEqual(shaderErrors,[],"WebGL shader compilation must not emit errors");
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
