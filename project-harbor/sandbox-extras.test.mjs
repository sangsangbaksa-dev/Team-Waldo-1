import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./sandbox-extras.js',import.meta.url),'utf8');
const marker="if(document.readyState==='loading')";
const index=source.indexOf(marker);assert.ok(index>0);
const sandbox={};vm.runInNewContext(source.slice(0,index)+'globalThis.logic={track,mapProjection,advance,courses,traps,roadGraph,roadRoute,audioModel,noteFrequency,musicStep,stations,migrateLegacy};})();',sandbox);
const {track,mapProjection,advance,courses,traps,roadGraph,roadRoute,audioModel,noteFrequency,musicStep,stations,migrateLegacy}=sandbox.logic;
const empty=()=>({driveMeters:0,walkMeters:0,escapes:0,maxEscape:0,traps:{}});
const p={x:0,z:0,alive:true,driving:true,wanted:3,peak:3,speed:30};
test('legitimate pursuit escape and trip distance',()=>{const r=track(p,{...p,x:10,wanted:0},empty());assert.equal(r.stats.escapes,1);assert.equal(r.stats.driveMeters,10);assert.equal(r.stats.maxEscape,3);});
test('teleport and death never award an escape',()=>{assert.equal(track(p,{...p,x:100,wanted:0},empty()).stats.escapes,0);assert.equal(track(p,{...p,alive:false,wanted:0},empty()).stats.escapes,0);});
test('speed trap keeps the best speed',()=>{const r=track(null,{x:-110,z:-440,alive:true,driving:true,wanted:0,speed:100},empty());assert.equal(r.stats.traps.boulevard,100);assert.equal(track(null,{x:-110,z:-440,alive:true,driving:true,wanted:0,speed:70},r.stats).stats.traps.boulevard,100);});
test('atlas projection round-trips',()=>{const pr=mapProjection({min:[-670,-600],max:[620,510]},960,680);const [x,z]=pr.world(...pr.point(-155,134));assert.ok(Math.abs(x+155)<1e-6&&Math.abs(z-134)<1e-6);});
test('all nine courses have ordered distinct adjacent checkpoints',()=>{assert.equal(courses.length,9);for(const c of courses){assert.ok(c.points.length>=4);for(let i=1;i<c.points.length;i++)assert.ok(Math.hypot(c.points[i][0]-c.points[i-1][0],c.points[i][1]-c.points[i-1][1])>24);}});

test('road route uses intersections without crossing disconnected roads',()=>{const g=roadGraph([{from:[0,0],to:[100,0]},{from:[50,-50],to:[50,50]},{from:[200,0],to:[300,0]}]);assert.ok(Math.abs(roadRoute(g,[10,0],[50,40]).meters-80)<1e-4);assert.equal(roadRoute(g,[10,0],[210,0]),null);assert.ok(Math.abs(roadRoute(g,[10,0],[20,0]).meters-10)<1e-4);});
test('real Harbor roads connect waterfront, coast and desert',()=>{const world=JSON.parse(readFileSync(process.env.HARBOR_WORLD_FILE,'utf8'));const g=roadGraph(world.roads);assert.ok(roadRoute(g,[40,33],[99,-36]));assert.ok(roadRoute(g,[-155,33],[385,438]));assert.ok(roadRoute(g,[-595,-440],[-70,-440]));});

test('vehicle audio uses speed and proximity of live police',()=>{const f={alive:true,position:{x:0,z:0},state:{isDriving:true,vehicle:{speed:20,vehicleClass:'sport'},wantedLevel:3,enemies:[{team:3,health:100,position:{x:20,z:0}}]}};const m=audioModel(f);assert.ok(m.freq>58&&m.engine>0);assert.ok(Math.abs(m.siren-.8)<1e-6);assert.equal(audioModel({...f,alive:false}).engine,0);});
test('original radio notes are deterministic and off is silent',()=>{assert.equal(noteFrequency(69),440);assert.equal(musicStep(stations[0],0),null);assert.ok(musicStep(stations[1],0).bass>0);assert.equal(musicStep(stations[1],1).bass,0);});
test('session generation prevents false escape records',()=>{const a=track({...p,generation:1},{...p,generation:2,wanted:0},empty());assert.equal(a.stats.escapes,0);assert.equal(a.stats.driveMeters,0);});
test('completed driving record cannot advance beyond last checkpoint',()=>{const run={started:true,index:courses[0].points.length,seconds:4,finished:true};assert.equal(advance(run,courses[0],{x:0,z:0},true,true,.1).seconds,4);});

test('legacy migration preserves best records without double counting trips',()=>{const saved={visited:['a'],records:{quay:12},topSpeed:75};const stats={...empty(),driveMeters:20};const legacy={visited:['a','b'],best:{quay:10},speeds:{lighthouse:88},trip:{drive:30,topSpeed:92}};migrateLegacy(saved,stats,legacy);migrateLegacy(saved,stats,legacy);assert.equal(saved.visited.length,2);assert.equal(saved.records.quay,10);assert.equal(stats.driveMeters,30);assert.equal(stats.traps.lighthouse,88);assert.equal(saved.topSpeed,92);});
