import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port=4179;
const server=spawn('npm',['run','dev','--','--host','127.0.0.1','--port',String(port)],{
  cwd:process.cwd(),stdio:'ignore',
});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let browser;
const failures=[];
const intersect=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*
  Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
try{
 let ready=false;
 for(let attempt=0;attempt<50;attempt++){
  try{const response=await fetch('http://127.0.0.1:'+port+'/');if(response.ok){ready=true;break;}}catch{}
  await sleep(250);
 }
 assert.ok(ready,'Vite did not start');
 browser=await chromium.launch({
  headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle',
    '--use-angle=swiftshader','--disable-dev-shm-usage'],
 });
 for(const width of [1280,320]){
  const page=await browser.newPage({
   viewport:{width,height:780},isMobile:width<=480,hasTouch:width<=480,
  });
  page.setDefaultTimeout(7000);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{
    if(message.type()==='error')errors.push(message.text().slice(0,350));
  });
  try{
   await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'domcontentloaded'});
   await page.waitForTimeout(700);
   await page.keyboard.press('Space');
   await page.locator('.war-ui').waitFor({timeout:15000});
   assert.equal(await page.locator('#outposts button').count(),9);
   assert.equal(await page.locator('#unit-train button').count(),8);
   // Onboarding instructions must work on both desktop and mobile.
   const guide=page.locator('.war-guide');
   await guide.locator('summary').click();
   assert.equal(await guide.getAttribute('open'),'');
   assert.match(await guide.innerText(),/안전지대/);
   await guide.locator('summary').click();
   assert.equal(await guide.getAttribute('open'),null);
   await page.locator('#policy button').nth(1).click();
   await page.locator('#reserve button').nth(2).click();
   assert.match(await page.locator('#policy .selected').innerText(),/성장/);
   assert.match(await page.locator('#reserve .selected').innerText(),/4명 수비/);
   // Quality and audio settings must remain interactive while simulation runs.
   await page.locator('#quality').click();
   assert.match(await page.locator('#quality').innerText(),/그래픽/);
   await page.locator('#audio').click();
   assert.equal(await page.locator('#audio').innerText(),'🔇');
   await page.locator('#audio').click();
   assert.equal(await page.locator('#audio').innerText(),'🔊');
   await page.locator('#save').click();
   const isSaved=await page.evaluate(()=>Boolean(localStorage.getItem('team-waldo-3d-war-v1')));
   assert.ok(isSaved,'Local battle was not saved');
   if(width<=480){
    const boxes=await page.evaluate(()=>{
     const rect=element=>{const r=element.getBoundingClientRect();
       return {top:r.top,left:r.left,right:r.right,bottom:r.bottom};};
     return {
      top:[...document.querySelectorAll('.war-top button')].map(rect),
      panel:rect(document.querySelector('.war-panel')),
      map:rect(document.querySelector('.war-minimap')),
     };
    });
    assert.ok(boxes.top.every(b=>intersect(b,boxes.panel)<1),'Top controls overlap economy panel');
    assert.ok(intersect(boxes.map,boxes.panel)<1,'Minimap overlaps economy panel');
    await page.locator('#map-mode').click();
    assert.equal(await page.locator('#map-mode').getAttribute('aria-pressed'),'true');
    const canvas=page.locator('#war-map');
    const bounds=await canvas.boundingBox();
    assert.ok(bounds);
    await canvas.click({position:{x:bounds.width/2,y:bounds.height/2}});
   } else {
    await page.locator('#war-map').click({position:{x:100,y:100},modifiers:['Shift']});
   }
   assert.match((await page.locator('#outposts .selected').allInnerTexts()).join(' '),/중앙 요새/);
   await page.locator('#load').click();
   await page.locator('.war-ui').waitFor();
   assert.match((await page.locator('#policy .selected').allInnerTexts()).join(' '),/성장/);
   // Repeatedly freeing/creating WebGL contexts must not corrupt game restarts.
   page.on('dialog',dialog=>void dialog.accept());
   await page.locator('#new').click();
   await page.locator('.war-ui').waitFor();
   assert.match((await page.locator('#policy .selected').allInnerTexts()).join(' '),/균형/);
   assert.equal(await page.evaluate(()=>localStorage.getItem('team-waldo-3d-war-v1')),null);
   // The render loop should publish a numeric FPS without throwing.
   await page.waitForTimeout(1250);
   assert.match(await page.locator('#war-fps').textContent(),/[0-9]+ FPS/);
   assert.deepEqual(errors,[],'Browser runtime errors');
   console.log('PASS '+width+'px: start, stable controls, strategy, save/load and minimap commands');
  }finally{await page.close();}
 }
}catch(error){failures.push(String(error.stack??error));process.exitCode=1;}
finally{await browser?.close().catch(()=>{});server.kill('SIGTERM');}
if(failures.length)console.error(failures.join('\n'));
