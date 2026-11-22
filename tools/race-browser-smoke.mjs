import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

// Dedicated SPEED RUSH real-browser WebGL regression: setup, gameplay, HUD and teardown.
const port=4197,origin='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let log='';for(const s of [server.stdout,server.stderr])s.on('data',b=>log+=b.toString());
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sizes=[
  {name:'desktop',width:1366,height:768,map:'storm',mode:'race',quality:'standard'},
  {name:'mobile',width:390,height:844,map:'desert',mode:'trial',quality:'low'}
];
const results=[];
let browser;
await mkdir('browser-artifacts',{recursive:true});
try{
  let ready=false;
  for(let i=0;i<120;i++){try{if((await fetch(origin)).ok){ready=true;break;}}catch{}await sleep(250);}
  assert.ok(ready,'Vite did not boot: '+log.slice(-1000));
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
  for(const size of sizes){
    const context=await browser.newContext({viewport:{width:size.width,height:size.height},isMobile:size.name==='mobile',hasTouch:size.name==='mobile',reducedMotion:'reduce'});
    await context.addInitScript(q=>localStorage.setItem('waldo.preferences.v1',JSON.stringify({quality:q,sound:false,reducedMotion:true})),size.quality);
    const page=await context.newPage();page.setDefaultTimeout(30000);
    const errors=[];page.on('pageerror',err=>errors.push(err.message));
    try{
      await page.goto(origin,{waitUntil:'domcontentloaded'});
      await page.locator('#start-race').click();
      await page.locator('.rc-setup').waitFor({state:'visible'});
      assert.equal(await page.locator('[data-pick^="map:"]').count(),7);
      assert.equal(await page.locator('[data-pick^="car:"]').count(),8);
      assert.ok(!/코스 위 상자를 먹고/.test(await page.locator('[data-note="mode"]').innerText()),'Do not advertise nonexistent items');
      await page.screenshot({path:'browser-artifacts/speed-rush-setup-'+size.name+'.png',animations:'disabled'});
      await page.locator('[data-pick="map:'+size.map+'"]').click();
      await page.locator('[data-pick="mode:'+size.mode+'"]').click();
      await page.locator('[data-pick="laps:1"]').click();
      await page.locator('[data-pick="car:velox"]').click();
      await page.locator('[data-setup="start"]').click();
      await page.waitForFunction(()=>!!window.__race?.view&&window.__race.view.renderer.info.render.calls>0);
      const start=await page.evaluate(()=>({
        calls:window.__race.view.renderer.info.render.calls,
        triangles:window.__race.view.renderer.info.render.triangles,
        rain:!!window.__race.view.rainFx,
        phase:window.__race.race.phase,
        motion:document.querySelector('.rc-root')?.classList.contains('reduced-motion')
      }));
      assert.ok(start.calls>0&&start.triangles>0,'3D scene must draw actual geometry');
      assert.equal(start.rain,size.map==='storm','Dry maps must not allocate rain particles');
      assert.equal(start.motion,true,'Reduced motion must reach game');
      assert.equal(await page.locator('#rc-laps').innerText(),'1');
      await page.screenshot({path:'browser-artifacts/speed-rush-start-'+size.name+'.png',animations:'disabled'});
      if(size.name==='mobile'){
        assert.ok(await page.locator('.rc-root').evaluate(el=>el.classList.contains('touch')),'Touch controls must be enabled');
        for(const name of ['left','right','gas','brake','drift','nitro'])assert.equal(await page.locator('[data-hold="'+name+'"]').count(),1,'Missing touch input '+name);
      }
      // The existing development hook allows deterministic speed tests without a time delay.
      await page.evaluate(()=>{window.__race.dbg.auto=true;window.__race.skip(6);});
      await page.waitForFunction(()=>window.__race?.race?.clock>0&&window.__race.race.player.car.vf>3);
      const driving=await page.evaluate(()=>({speed:window.__race.race.player.car.vf,phase:window.__race.race.phase,calls:window.__race.view.renderer.info.render.calls}));
      assert.ok(driving.speed>3&&driving.calls>0,'Race must accelerate and render');
      await page.screenshot({path:'browser-artifacts/speed-rush-driving-'+size.name+'.png',animations:'disabled'});
      await page.locator('.rc-btns [data-act="pause"]').click();
      await page.locator('.rc-modal.show [data-act="resume"]').waitFor();
      assert.equal(await page.locator('.rc-modal.show h2').innerText(),'일시정지');
      await page.locator('.rc-modal.show [data-act="resume"]').click();
      await page.locator('.rc-modal.show').waitFor({state:'hidden'});
      await page.evaluate(()=>{window.__race.savedTrack=window.__race.race.track;});
      await page.locator('.rc-btns [data-act="pause"]').click();
      await page.locator('.rc-modal.show [data-act="restart"]').click();
      await page.waitForFunction(()=>window.__race?.race?.clock<0&&window.__race?.view?.renderer?.info?.render?.calls>0);
      assert.equal(await page.evaluate(()=>window.__race.race.track===window.__race.savedTrack),true,'Restart must reuse precomputed track');
      await page.locator('.rc-btns [data-act="pause"]').click();
      await page.locator('.rc-modal.show [data-act="setup"]').click();
      await page.locator('.rc-setup').waitFor({state:'visible'});
      const switchMap=size.map==='storm'?'desert':'storm';
      await page.locator('[data-pick="map:'+switchMap+'"]').click();
      await page.locator('[data-setup="start"]').click();
      await page.waitForFunction(()=>window.__race?.race?.clock<0&&window.__race?.view?.renderer?.info?.render?.calls>0);
      assert.equal(await page.evaluate(()=>window.__race.race.track===window.__race.savedTrack),false,'Map switch must rebuild its spline');
      assert.equal(await page.evaluate(()=>!!window.__race.view.rainFx),switchMap==='storm','Rain visuals must follow the newly chosen map');
      await page.screenshot({path:'browser-artifacts/speed-rush-switched-'+size.name+'.png',animations:'disabled'});
      await page.locator('.rc-btns [data-act="exit"]').click();
      await page.locator('.tile').first().waitFor();
      assert.equal(await page.locator('.rc-root').count(),0,'Exit must clean up race DOM');
      assert.equal(await page.evaluate(()=>window.__race),undefined,'Exit must release debug reference');
      assert.deepEqual(errors,[],'Page errors in '+size.name);
      results.push({size:size.name,status:'passed',start,driving});
      console.log('PASS SPEED RUSH browser: '+size.name);
    }catch(error){
      process.exitCode=1;results.push({size:size.name,status:'failed',error:String(error?.stack||error),errors});
      await page.screenshot({path:'browser-artifacts/speed-rush-fail-'+size.name+'.png'}).catch(()=>undefined);
      console.error('FAIL SPEED RUSH browser: '+size.name,error);
    }finally{await context.close();}
  }
}catch(error){process.exitCode=1;results.push({status:'failed',error:String(error?.stack||error)});console.error(error);}
finally{
  await writeFile('browser-artifacts/speed-rush-report.json',JSON.stringify(results,null,2));
  await browser?.close().catch(()=>undefined);server.kill('SIGTERM');
}
