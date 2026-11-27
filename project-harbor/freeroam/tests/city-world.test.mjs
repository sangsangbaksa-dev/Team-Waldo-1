import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCityActivities,roadGraph,roadRoute} from '../city-activities-domain.mjs';
const world=JSON.parse(readFileSync(process.env.HARBOR_WORLD_FILE??new URL('../../../data/world/harbor_front.json',import.meta.url),'utf8'));
test('shipping world supports all activity locations and connected delivery routes',()=>{
 const game=createCityActivities(world),graph=roadGraph(world.roads);
 assert.equal(game.trails.length,3);assert.equal(game.stops.length,7);assert.equal(game.jobs.length,6);assert.equal(game.surveys.length,21);assert.equal(game.journal().length,7);
 const {min,max}=world.bounds;
 for(const stop of game.stops){const [x,z]=stop.point;assert.ok(x>=min[0]&&x<=max[0]&&z>=min[1]&&z<=max[1]);const clearance=Math.min(...world.obstacles.filter(b=>b.center[1]+b.size[1]/2>.3).map(b=>Math.hypot(Math.max(0,Math.abs(x-b.center[0])-b.size[0]/2),Math.max(0,Math.abs(z-b.center[2])-b.size[2]/2))));assert.ok(clearance>4,stop.name+' overlaps a building');}
 for(const job of game.jobs){const route=roadRoute(graph,job.from.point,job.to.point);assert.ok(route?.meters>0,job.id+' disconnected');assert.ok(route.meters/job.limit<8,job.id+' too short a time limit');}
});
