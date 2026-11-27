import test from 'node:test';
import assert from 'node:assert/strict';
import {driveAudioTargets as t} from '../drive-audio-domain.mjs';
test('engine only while driving and playing',()=>{assert.equal(t().engine,0);assert.equal(t({driving:true,playing:false,speed:20}).road,0);assert.equal(t({driving:true,muted:true,speed:20}).engine,0);assert.ok(t({driving:true,speed:10}).engine>0);});
test('RPM and tire sound follow speed, steering and braking',()=>{let idle=t({driving:true}),moving=t({driving:true,speed:25,previousSpeed:24,steering:.7});assert.ok(moving.rpm>idle.rpm);assert.ok(moving.skid>idle.skid);assert.ok(moving.road>idle.road);assert.ok(t({driving:true,speed:20,previousSpeed:25}).skid>0);});
test('invalid numbers cannot produce invalid audio values',()=>{for(const v of Object.values(t({driving:true,speed:Infinity,steering:NaN,dt:0,volume:NaN})))assert.ok(Number.isFinite(v));});
