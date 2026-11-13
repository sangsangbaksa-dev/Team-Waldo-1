import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 await mkdir('browser-artifacts',{recursive:true});
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('waldo.preferences.v1',JSON.stringify({quality:'low',sound:false,reducedMotion:true})));
  await page.goto((process.env.WALDO_TEST_ORIGIN||'http://127.0.0.1:4182'));await page.locator('#start-grand').click();await page.waitForFunction(()=>window.__war);
  await page.evaluate(()=>window.__war.setPaused(true));
  assert.deepEqual(await page.evaluate(()=>[0,1,2,3].map(id=>window.__war.world.units.filter(u=>u.owner===id).length)),[100,100,100,100]);
  assert.equal(await page.locator('#outposts button').count(),33);
  await page.locator('#tab-economy').click();await page.locator('[data-facility=farm]').click();
  await page.getByLabel('시설 X 좌표').fill('-300');await page.getByLabel('시설 Z 좌표').fill('-210');await page.getByRole('button',{name:'입력한 좌표에 건설'}).click();
  assert.equal(await page.evaluate(()=>window.__war.world.facilities.filter(b=>b.kind==='farm').length),1);
  const placed=await page.evaluate(()=>window.__war.world.facilities[0]);assert.equal(placed.x,-300);assert.equal(placed.z,-210);
  await page.locator('[data-open-base]').click();await page.locator('[data-interior=hospital]').click();await page.getByRole('button',{name:'2행 3열 빈 구획',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.__war.world.facilities.filter(b=>b.kind==='hospital'&&b.interior?.col===2&&b.interior.row===1).length),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`browser-artifacts/base-interior-${width}.png`,fullPage:true});await page.getByRole('button',{name:'전장으로 복귀'}).click();
  await page.evaluate(()=>{const {world,camera}=window.__war;camera.position.set(450,640,550);camera.lookAt(0,0,0);world.factions[0].gold=100000;world.factions[0].food=100000;});
  await page.waitForTimeout(500);await page.screenshot({path:`browser-artifacts/expanded-world-${width}.png`});
  assert.deepEqual(errors,[]);console.log(`PASS ${width}px: equal armies, 33 objectives, exact outdoor placement, hospital grid placement, layout and WebGL`);await page.close();
 }
}finally{await browser.close();}
