import { describe, expect, it } from 'vitest';
import { createWar, stepWar, getIncome } from '../../src/battle/war';
import { develop, assignWorker, exportFood, acceptContract, deliverContract, CONTRACTS } from '../../src/battle/economy';
import { encodeWar, decodeWar } from '../../src/battle/save';
const funded = () => {const w=createWar();w.factions[0].gold=2000;w.factions[0].food=2000;return w;};
describe('city production and trade economy', () => {
 it('charges construction once, waits, then opens worker capacity', () => {
  const w=funded(), f=w.factions[0];
  expect(assignWorker(w,0,'miners',1)).toBe(false);
  expect(develop(w,0,'city')).toBe(true);expect(f.gold).toBe(1900);
  expect(develop(w,0,'market')).toBe(false);
  for(let i=0;i<251;i++)stepWar(w,.1);
  expect(f.economy!.city).toBe(2);expect(assignWorker(w,0,'miners',1)).toBe(true);
  const before=getIncome(w,0).gold;expect(assignWorker(w,0,'farmers',-1)).toBe(true);
  expect(assignWorker(w,0,'miners',1)).toBe(true);
  // A level-one mine is saturated with two miners.
  expect(getIncome(w,0).gold).toBe(before);
 });
 it('requires a market and charges food with a timed export cooldown', () => {
  const w=funded(),f=w.factions[0];expect(exportFood(w,0)).toBe(false);
  f.economy!.market=1;expect(exportFood(w,0)).toBe(true);
  expect(f.food).toBe(1940);expect(f.gold).toBe(2075);expect(exportFood(w,0)).toBe(false);
 });
 it('escrows deposits, delivers atomically and forfeits overdue contracts', () => {
  const w=funded(),f=w.factions[0];f.economy!.market=1;
  expect(acceptContract(w,0,'grain')).toBe(true);expect(f.gold).toBe(1965);
  expect(acceptContract(w,0,'relief')).toBe(false);
  f.food=0;expect(deliverContract(w,0)).toBe(false);expect(f.gold).toBe(1965);
  f.food=120;expect(deliverContract(w,0)).toBe(true);expect(f.gold).toBe(2210);
  expect(deliverContract(w,0)).toBe(false);expect(acceptContract(w,0,'grain')).toBe(true);
  w.time=CONTRACTS.grain.duration;stepWar(w,.025);
  expect(f.economy!.failed).toBe(1);expect(f.economy!.contract).toBeNull();
 });
 it('resumes pending work and migrates v2 without accepting malformed v3', () => {
  const w=funded();develop(w,0,'market');expect(decodeWar(encodeWar(w))).toEqual(w);
  const old=JSON.parse(encodeWar(w));old.version=2;for(const f of old.war.factions)delete f.economy;
  expect(decodeWar(JSON.stringify(old))!.factions[0].economy!.city).toBe(1);
  const bad=JSON.parse(encodeWar(w));bad.war.factions[0].economy.miners=100;
  expect(decodeWar(JSON.stringify(bad))).toBeNull();
 });
});
