import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
// Test-only credentials are supplied out of tree and never committed or printed.
const accounts=JSON.parse(await readFile(process.env.WALDO_QA_ACCOUNTS,'utf8'));
const browser=await chromium.launch({headless:true,proxy:process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}:undefined});
const contexts=[];
try{
 const pages=[];
 for(let i=0;i<5;i++){
  const context=await browser.newContext();await context.route(`${process.env.WALDO_TEST_ORIGIN||'http://127.0.0.1:4182'}/**`,async route=>{if(new URL(route.request().url()).pathname==='/'){await route.fulfill({contentType:'text/html',body:'<!doctype html><html><body>Network verification</body></html>'});return;}if(new URL(route.request().url()).pathname.endsWith('/src/main.ts')){await route.fulfill({contentType:'application/javascript',body:''});return;}const response=await fetch(route.request().url());await route.fulfill({status:response.status,headers:{'content-type':response.headers.get('content-type')||'text/plain'},body:Buffer.from(await response.arrayBuffer())});});contexts.push(context);const page=await context.newPage();pages.push(page);page.on('requestfailed',request=>console.log('Network failure:',request.url().split('?')[0],request.failure()?.errorText));
  const response=await page.goto((process.env.WALDO_TEST_ORIGIN||'http://127.0.0.1:4182'),{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);
  await page.evaluate(async({email,password})=>{const {pvpClient,PvpSession}=await import('/src/battle/pvp.ts');const {error}=await pvpClient.auth.signInWithPassword({email,password});if(error)throw error;window.qaClient=pvpClient;window.qaState={};window.qaSession=new PvpSession({lobby:(room,players)=>{window.qaState.room=room;window.qaState.players=players;},state:war=>{window.qaState.war=structuredClone(war);},status:message=>{window.qaState.status=message;}});},accounts[i]);
 }
 await pages[0].evaluate(()=>window.qaSession.enter('QA host'));
 const code=await pages[0].evaluate(()=>window.qaSession.room.code);
 for(let i=1;i<4;i++)await pages[i].evaluate(({code,i})=>window.qaSession.enter(`QA ${i}`,code),{code,i});
 const full=await pages[4].evaluate(async code=>{try{await window.qaSession.enter('QA overflow',code);return false;}catch{return true;}},code);assert.equal(full,true);
 const outsider=await pages[4].evaluate(async code=>{const {data,error}=await window.qaClient.from('waldo_rooms').select('id').eq('code',code);return !error&&data.length===0;},code);assert.equal(outsider,true);
 await pages[0].evaluate(()=>window.qaSession.start());
 for(const page of pages.slice(0,4))await page.waitForFunction(()=>window.qaState.war?.units.length===400,{timeout:30000});
 assert.deepEqual(await pages[0].evaluate(()=>window.qaState.war.humanFactions),[0,1,2,3]);
 const rid=await pages[0].evaluate(()=>window.qaSession.room.id);
 const denied=await pages[1].evaluate(async rid=>{const {data,error}=await window.qaClient.from('waldo_rooms').update({snapshot:'tampered'}).eq('id',rid).select();return !!error||data.length===0;},rid);assert.equal(denied,true);
 await pages[1].evaluate(()=>window.qaSession.command({type:'build',key:'farm',x:285,z:-260}));
 for(const page of pages.slice(0,4))await page.waitForFunction(()=>window.qaState.war?.facilities.some(b=>b.owner===1&&b.kind==='farm'),{timeout:30000});
 await pages[2].evaluate(()=>window.qaSession.command({type:'interior',key:'hospital',baseId:0,col:2,row:1}));
 for(const page of pages.slice(0,4))await page.waitForFunction(()=>window.qaState.war?.facilities.some(b=>b.owner===2&&b.kind==='hospital'),{timeout:30000});
 const fake=await pages[1].evaluate(async({rid,user_id})=>{const {error}=await window.qaClient.from('waldo_commands').insert({room_id:rid,user_id,command:{type:'build',key:'farm'}});return !!error;},{rid,user_id:accounts[0].id});assert.equal(fake,true);
 console.log('PASS: email/password, 4-player room, fifth seat rejected, private room RLS, guest state-write denied, spoofed identity denied, real Realtime facility and interior commands delivered to all 4 clients.');
}finally{
 for(const context of contexts){for(const page of context.pages())await page.evaluate(async()=>{await window.qaSession?.close();await window.qaClient?.auth.signOut();}).catch(()=>{});await context.close();}
 await browser.close();
}
