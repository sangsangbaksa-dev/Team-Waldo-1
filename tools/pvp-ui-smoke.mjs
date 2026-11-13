import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const accounts=JSON.parse(await readFile(process.env.WALDO_QA_ACCOUNTS,'utf8'));
const browser=await chromium.launch({headless:true,proxy:process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}:undefined,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let peer;
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 await context.route('http://127.0.0.1:4182/**',async route=>{const response=await fetch(route.request().url());await route.fulfill({status:response.status,headers:{'content-type':response.headers.get('content-type')||'text/plain'},body:Buffer.from(await response.arrayBuffer())});});
 await context.addInitScript(()=>localStorage.setItem('waldo.preferences.v1',JSON.stringify({quality:'low',sound:false,reducedMotion:true})));
 const page=await context.newPage();await page.goto('http://127.0.0.1:4182',{waitUntil:'domcontentloaded'});await page.locator('#start-pvp').click();
 await page.locator('#pvp-auth input[name=email]').fill(accounts[3].email);await page.locator('#pvp-auth input[name=password]').fill(accounts[3].password);await page.locator('#pvp-auth button[type=submit]').click();await page.locator('#pvp-connect').waitFor({state:'visible'});
 await page.locator('#pvp-connect button[value=create]').click();await page.waitForFunction(()=>document.querySelector('#pvp-code')?.textContent.length===12);const code=await page.locator('#pvp-code').textContent();
 const peerContext=await browser.newContext();await peerContext.route('http://127.0.0.1:4182/**',async route=>{if(route.request().url().endsWith('/src/main.ts')){await route.fulfill({contentType:'application/javascript',body:''});return;}const response=await fetch(route.request().url());await route.fulfill({status:response.status,headers:{'content-type':response.headers.get('content-type')||'text/plain'},body:Buffer.from(await response.arrayBuffer())});});
 peer=await peerContext.newPage();await peer.goto('http://127.0.0.1:4182',{waitUntil:'domcontentloaded'});await peer.evaluate(async({account,code})=>{const {PvpSession,pvpClient}=await import('/src/battle/pvp.ts');await pvpClient.auth.signInWithPassword({email:account.email,password:account.password});window.peer=new PvpSession({lobby:()=>{},state:w=>{window.peerWar=w;},status:()=>{}});await window.peer.enter('UI 검증 상대',code);},{account:accounts[4],code});
 await page.locator('#pvp-start').click();await page.locator('.pvp-viewport canvas').waitFor();await page.waitForFunction(()=>document.querySelector('#pvp-facilities')?.textContent.includes('시설 1/30'),null,{timeout:60000});
 await page.getByRole('button',{name:'농장 · 금 65 / 식량 20',exact:true}).click();const rect=await page.locator('#pvp-map').boundingBox();await page.locator('#pvp-map').click({position:{x:(-230/520+1)*rect.width/2,y:(-260/520+1)*rect.height/2}});
 await peer.waitForFunction(()=>window.peerWar?.facilities.some(b=>b.owner===0&&b.kind==='farm'),{timeout:30000});
 await page.getByRole('button',{name:'기지 내부 관리',exact:true}).click();await page.locator('[data-interior=school]').click();await page.getByRole('button',{name:'1행 1열 빈 구획',exact:true}).click();await peer.waitForFunction(()=>window.peerWar?.facilities.some(b=>b.owner===0&&b.kind==='school'),{timeout:30000});
 await page.getByRole('button',{name:'전장으로 복귀'}).click();await page.screenshot({path:'browser-artifacts/pvp-live-command.png'});assert.match(await page.locator('#pvp-resources').textContent(),/금/);await page.locator('#pvp-exit').click();console.log('PASS: real email login UI → create room → peer joins → start WebGL battle → selected outdoor position → school interior grid → peer realtime update.');
}finally{await peer?.evaluate(()=>window.peer?.close()).catch(()=>{});await browser.close();}
