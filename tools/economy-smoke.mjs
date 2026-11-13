import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4181'],{stdio:'ignore'});
let browser;
try {
 for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:4181')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const width of [1440,320]){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.goto('http://127.0.0.1:4181');await page.locator('#start-war').click();
  await page.waitForFunction(()=>window.__war);
  // Explicit fixture: fund construction and freeze the combat clock.
  await page.evaluate(()=>{const h=window.__war;h.skipDrop();document.querySelector("#adventure-strategy").click();h.setPaused(true);h.world.factions[0].gold=2000;h.world.factions[0].food=2000;h.ui();});
  await page.locator('#tab-economy').click();
  const section=page.locator('.economy-expansion');
  await section.getByRole('button',{name:/시장 Lv/}).click();
  assert.equal(await page.evaluate(()=>window.__war.world.factions[0].economy.construction.kind),'market');
  await page.evaluate(()=>{const e=window.__war.world.factions[0].economy;e.market=1;e.construction=null;window.__war.ui();});
  await section.getByRole('button',{name:/식량 60 수출/}).click();
  await section.getByRole('button',{name:/도시 식량 납품/}).click();
  await section.getByRole('button',{name:/계약 납품/}).click();
  assert.equal(await page.evaluate(()=>window.__war.world.factions[0].economy.completed),1);
  assert.equal(await page.evaluate(()=>window.__war.world.factions[0].economy.exports),1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  console.log(`Economy interactions passed at ${width}px`);
  await page.close();
 }
 console.log('Economy browser smoke passed: 1440px and 320px; market, export, contract delivery.');
} finally {await browser?.close();server.kill();}
