import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const port=4183,origin=`http://127.0.0.1:${port}`,dir='browser-artifacts/management';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let output='',browser;server.stdout.on('data',c=>{output+=c;});server.stderr.on('data',c=>{output+=c;});
const report={fixture:'Funded resources and seeded incoming assault; all commands use visible controls and the real simulation clock.',cases:[]};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
 for(let i=0;i<100;i++){if(server.exitCode!==null)throw new Error(output);if(await fetch(origin).then(r=>r.ok).catch(()=>false))break;await sleep(100);}
 await mkdir(dir,{recursive:true});browser=await chromium.launch({args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:320,height:780},{width:844,height:390}]){
  const context=await browser.newContext({viewport,reducedMotion:'reduce'});await context.addInitScript(()=>localStorage.setItem('waldo.preferences.v1',JSON.stringify({quality:'low',sound:false,reducedMotion:true})));
  const page=await context.newPage();page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const click=selector=>page.locator(selector).click();
  const screenshot=name=>page.screenshot({path:`${dir}/${viewport.width}-${name}.png`,timeout:30000});
  const advance=seconds=>page.evaluate(async amount=>{const {stepWar}=await import('/src/battle/war.ts');for(let i=0;i<Math.round(amount*10);i++)stepWar(window.__war.world,.1);window.__war.ui();},seconds);
  const inPanel=selector=>page.locator(selector).evaluate(node=>{const r=node.getBoundingClientRect(),p=document.querySelector('.war-panel-scroll').getBoundingClientRect();return r.top>=p.top-1&&r.bottom<=p.bottom+1;});
  console.log(`STAGE management ${viewport.width}: campaign and guidance`);await page.goto(origin);
  if(viewport.width===1440){
   await click('#mode-conquest');assert.match(await page.locator('#mode-goal').innerText(),/정복 승리/);await click('#start-war');await page.waitForFunction(()=>!!window.__war);await page.evaluate(()=>window.__war.setPaused(true));assert.equal(await page.evaluate(()=>window.__war.world.economyCampaign),false);await click('#exit');await click('#mode-economy');
  }
  await click('#start-war');if(await page.locator('.dialog-confirm').isVisible())await click('.dialog-confirm');await page.waitForFunction(()=>!!window.__war);
  await page.evaluate(()=>{const h=window.__war;h.setPaused(true);h.world.factions[0].gold=1000;h.world.factions[0].food=1000;h.world.factions.slice(1).forEach(f=>{f.aiTimer=99999;});h.ui();});
  await click('#mission-action');assert.equal(await inPanel('#build-mine'),true,'Tutorial must reveal the actual production button');
  await click('#build-mine');await click('#mission-action');assert.equal(await inPanel('#build-farm'),true);await click('#build-farm');
  await screenshot('production');
  console.log(`STAGE management ${viewport.width}: queue and rally`);
  await click('#tab-army');await click('#squad-infantry');assert.match(await page.locator('#army-count').innerText(),/4 \+3 \/ 18/);
  await advance(4);assert.match(await page.locator('#army-count').innerText(),/5 \+2 \/ 18/);
  await click('#cancel-training-0');assert.match(await page.locator('#army-count').innerText(),/5 \/ 18/);
  await click('#rally-set');const map=await page.locator('#war-map').boundingBox();await page.locator('#war-map').click({position:{x:map.width*.35,y:map.height*.35}});
  assert.ok(await page.evaluate(()=>window.__war.world.recruitment[0].rally));assert.equal(await page.locator('#rally-set').getAttribute('aria-pressed'),'false');
  await click('#train-infantry');await advance(4);assert.equal(await page.evaluate(()=>window.__war.world.units.some(u=>u.owner===0&&u.rallyPoint)),true);
  await page.locator('.war-panel-scroll').evaluate(el=>{el.scrollTop=0;});await screenshot('training');
  console.log(`STAGE management ${viewport.width}: city and logistics`);
  await click('#tab-city');await click('#civil-build-market');await advance(20);await click('#civil-build-city');await advance(25);await click('#civil-build-port');await advance(30);
  await click('#tab-economy');await click('#worker-minus-mine');await click('#worker-plus-trade');
  await page.evaluate(()=>{window.__war.world.outposts[8].owner=0;window.__war.ui();});
  await click('#tab-trade');await click('#route-map-overseas');await click('#export-overseas');
  const route=await page.evaluate(async()=>{const {exportDestination}=await import('/src/battle/economy.ts');return exportDestination(window.__war.world,0,'overseas').id;});assert.equal(route,8);
  await page.evaluate(()=>{window.__war.world.outposts[8].owner=null;window.__war.ui();});await advance(5);assert.match(await page.locator('#shipment-status').innerText(),/운송 중단/);
  await screenshot('logistics');await page.evaluate(()=>{window.__war.world.outposts[8].owner=0;window.__war.ui();});await advance(35);
  await click('#contract-provisions');assert.ok((await page.locator('#contract-forecast').innerText()).length>0);await click('#fulfill-contract');
  console.log(`STAGE management ${viewport.width}: incoming assault and save`);
  await page.evaluate(()=>{window.__war.world.factions[1].target=0;window.__war.ui();});await click('#mission-action');assert.equal(await inPanel('#defend'),true,'Incoming assault must reveal the defend control inside the scroll viewport');
  await screenshot('defense');await click('#defend');await click('#save');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('team-waldo-3d-war-v1')));assert.equal(saved.version,5);assert.ok(saved.war.recruitment[0].rally);
  const layout=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,save:rect('#save'),explore:rect('#adventure-enter')};});
  assert.equal(layout.overflow,false);const a=layout.save,b=layout.explore;assert.ok(Math.min(a.right,b.right)<=Math.max(a.left,b.left)||Math.min(a.bottom,b.bottom)<=Math.max(a.top,b.top),'Explore must not overlap manual saving');assert.deepEqual(errors,[]);
  report.cases.push({viewport,passed:true,defendVisible:true,queue:true,rally:true,securedSeaRoute:route,errors});await context.close();console.log(`PASS management ${viewport.width}×${viewport.height}`);
 }
}catch(error){report.error=String(error.stack??error);console.error(report.error);process.exitCode=1;}
finally{await browser?.close();server.kill('SIGTERM');await mkdir(dir,{recursive:true});await writeFile(`${dir}/report.json`,JSON.stringify(report,null,2));}
