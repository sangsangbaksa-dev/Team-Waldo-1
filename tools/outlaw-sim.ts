// OUTLAW CITY 헤드리스 점검: 시민 주인공·무기·일거리·카지노·부동산·차고·업적을 시뮬레이션만으로 확인합니다.
// 실행: npx tsx tools/outlaw-sim.ts
import { Sim } from '../src/outlaw/sim';
import { HEROES, PROPERTIES, CAR_SHOP, ACHIEVEMENTS } from '../src/outlaw/life';
import { blankCarInput, blankPedInput, WEAPONS, WEAPON_ORDER, PLAYER_ID } from '../src/outlaw/types';
import { startJob, stepJobs, pickpocket, JOB_LIST } from '../src/outlaw/jobs';
import { setOutfit, nearVending, buySnack, buyProperty, collectProperties, buyCar, callCar, train, bribe, treat } from '../src/outlaw/services';
import { slotSpin, rouletteSpin, coinFlip, Blackjack, handValue } from '../src/outlaw/casino';
import { makeRng } from '../src/outlaw/types';

let failed = 0;
const ok = (cond: boolean, name: string): void => { if (!cond) { failed++; console.log('✖', name); } else console.log('✔', name); };
const run = (s: Sim, sec: number): void => { for (let i = 0; i < sec * 60; i++) s.step(1 / 60, blankPedInput(), blankCarInput()); };
const go = (s: Sim, x: number, z: number): void => { s.player.x = x; s.player.z = z; s.player.vx = s.player.vz = 0; };

// 1) 주인공 8명
for (const h of HEROES) {
  const s = new Sim(7); s.applyHero(h.id); run(s, 2);
  ok(s.player.variant === h.variant && s.player.maxHp === s.perk.hp && s.player.alive, `주인공 ${h.name} (${h.job}) 적용`);
}
{ const s = new Sim(7); s.applyHero('h6'); ok(s.price(1000) === 800, '가게 사장 20% 할인'); const sv = JSON.parse(JSON.stringify(s.exportSave())); const t = new Sim(7, sv); ok(t.life.hero === 'h6' && t.player.variant === 6, '저장·불러오기에서 주인공 유지'); }

// 2) 무기
{
  const s = new Sim(3); const p = s.player; ok(WEAPON_ORDER.length === 11 && !!WEAPONS.railgun && !!WEAPONS.bat, '무기 11종');
  for (const id of ['bat', 'grenade', 'minigun', 'railgun'] as const) s.giveWeapon(p, id);
  const foe = s.spawnPed('gang', p.x + 1.6, p.z, { keep: true }); foe.guns = foe.guns.map(() => null); p.yaw = 0; p.cur = WEAPON_ORDER.indexOf('bat');
  const hp = foe.hp; for (let i = 0; i < 80; i++) s.step(1 / 60, { ...blankPedInput(), fire: i % 2 === 0, yaw: 0 }, blankCarInput()); ok(foe.hp < hp, '방망이 근접 피해');
  p.cur = WEAPON_ORDER.indexOf('grenade'); const g0 = p.guns[p.cur]!.mag; p.cd = 0; s.step(1 / 60, blankPedInput(), blankCarInput()); p.cd = 0; foe.x = p.x + 8; foe.z = p.z; const fhp = foe.hp;
  s.step(1 / 60, { ...blankPedInput(), fire: true, yaw: 0, pitch: 0.1 }, blankCarInput()); ok(p.guns[p.cur]!.mag === g0 - 1 && s.projectiles.some(r => r.kind === 'grenade'), '수류탄 투척');
  run(s, 3.5); ok(!s.projectiles.length, '수류탄 폭발·소멸'); void fhp;
}

// 3) 부동산·차고·체육관·병원
{
  const s = new Sim(5); s.cash = 500000; ok(buyProperty(s, PROPERTIES[0]!.id).includes('인수'), '부동산 구입'); run(s, 120); ok(s.life.propBank > 0, '부동산 수입 적립'); const before = s.cash; collectProperties(s); ok(s.cash > before, '수입 수금');
  const dealer = s.map.pois.find(q => q.kind === 'dealer')!; ok(!!dealer, '자동차 매장 POI'); go(s, dealer.x, dealer.z);
  ok(buyCar(s, 8).includes('구입'), 'GT 구입'); ok(s.life.cars.length === 1 && s.vehicles.some(v => v.tag === 'owned' && v.kind === 'gt'), '내 차 등장');
  go(s, 0, 0); ok(callCar(s, 0).includes('도착'), '내 차 호출');
  const gym = s.map.pois.find(q => q.kind === 'gym')!; go(s, gym.x, gym.z); ok(train(s, 'stamina').includes('1단계') && s.player.maxHp === s.perk.hp, '체력 단련');
  s.player.hp = 10; const hos = s.map.pois.find(q => q.kind === 'hospital')!; go(s, hos.x, hos.z); ok(treat(s).includes('치료') && s.player.hp === s.player.maxHp, '병원 치료');
  s.setStars(3); s.wanted.unseenT = 20; s.cash = 5000; ok(bribe(s).includes('해제') && s.wanted.stars === 0, '뇌물로 수배 해제');
}

// 4) 일거리
for (const info of JOB_LIST) {
  const s = new Sim(11); s.cash = 5000; if (info.id === 'fight') { const a = s.map.pois.find(q => q.kind === 'arena')!; go(s, a.x, a.z); }
  const r = startJob(s, info.id); ok(r === '' && s.job.active === info.id, `${info.name} 시작`); run(s, 3); ok(s.job.active === info.id && s.job.markers.length > 0, `${info.name} 표식·진행`);
}
{ // 배달 완주
  const s = new Sim(11); startJob(s, 'courier'); const c0 = s.cash;
  for (let i = 0; i < 3; i++) { go(s, s.job.data[`x${i}`]!, s.job.data[`z${i}`]!); stepJobs(s, 0.1); }
  ok(!s.job.active && s.cash > c0 + 300 && (s.life.counters.courier ?? 0) === 1, '배달 3건 완료 보상');
}
{ // 자경단 완주
  const s = new Sim(11); startJob(s, 'vigilante'); for (let i = 0; i < 4; i++) s.ped(s.job.ids[`e${i}`]!)!.hp = 0, s.killPed(s.ped(s.job.ids[`e${i}`]!)!, PLAYER_ID, 'pistol'); const c0 = s.cash; stepJobs(s, 0.1); ok(!s.job.active && s.cash >= c0 + 700, '자경단 완료 보상');
}
{ // 응급 이송 완주
  const s = new Sim(11); startJob(s, 'paramedic'); const car = s.vehicle(s.job.ids.car)!, pt = s.ped(s.job.ids.patient)!; s.enterVehicle(s.player, car); car.x = pt.x + 2; car.z = pt.z; car.vf = 0; car.vx = car.vz = 0; stepJobs(s, 0.1); ok(s.job.stage === 1, '환자 탑승');
  const h = s.map.pois.find(q => q.kind === 'hospital')!; car.x = h.x; car.z = h.z; const c0 = s.cash; stepJobs(s, 0.1); ok(!s.job.active && s.cash > c0, '응급 이송 보상');
}
{ // 소매치기
  const s = new Sim(2); const p = s.player; const c = s.spawnPed('civ', p.x + 1, p.z, { keep: true }); c.yaw = 0; p.x = c.x - 1.0; const c0 = s.cash; const r = pickpocket(s); ok(r.includes('+$') && s.cash > c0, '소매치기 성공'); void c;
}

{ // 타임 트라이얼 완주
  const s = new Sim(11); startJob(s, 'trial'); const car = s.spawnVehicle('gt', s.player.x, s.player.z, 0, { keep: true }); s.enterVehicle(s.player, car); const c0 = s.cash;
  for (let i = 0; i < 5; i++) { car.x = s.job.data[`x${i}`]!; car.z = s.job.data[`z${i}`]!; stepJobs(s, 0.1); } ok(!s.job.active && s.cash > c0 + 900, '타임 트라이얼 완주 보상');
}
{ // 도주 운전
  const s = new Sim(11); startJob(s, 'getaway'); const car = s.spawnVehicle('sedan', 0, 0, 0, { keep: true }); s.enterVehicle(s.player, car); const b = s.map.pois.find(q => q.id === 'bank0')!; car.x = b.x; car.z = b.z; car.vf = 0;
  for (let i = 0; i < 150; i++) stepJobs(s, 0.02); ok(s.job.stage === 1 && s.wanted.stars === 3, '일행 탑승 시 수배 3★');
  const homes = s.map.pois.filter(q => q.kind === 'safehouse').sort((a, c) => Math.hypot(a.x - s.player.x, a.z - s.player.z) - Math.hypot(c.x - s.player.x, c.z - s.player.z)); const h = homes[1] ?? homes[0]!; car.x = h.x; car.z = h.z; s.setStars(0); const c0 = s.cash; stepJobs(s, 0.1); ok(!s.job.active && s.cash >= c0 + 2200, '도주 운전 보상');
}
{ // 밀수
  const s = new Sim(11); startJob(s, 'smuggle'); const car = s.vehicle(s.job.ids.car)!; s.enterVehicle(s.player, car); stepJobs(s, 0.1); ok(s.job.stage === 1 && s.wanted.stars >= 2, '밀수 상자 적재 시 수배');
  car.x = s.job.data.x!; car.z = s.job.data.z!; s.setStars(1); const c0 = s.cash; stepJobs(s, 0.1); ok(!s.job.active && s.cash >= c0 + 1800, '밀수 보상');
}
{ // 옷장·자판기
  const s = new Sim(4); s.cash = 500; ok(setOutfit(s, 3).includes('새 옷') && s.life.outfit === 3, '옷 갈아입기');
  const v = s.map.props.find(q => q.kind === 'vending' || q.kind === 'kiosk'); if (v) { s.player.x = v.x + 1; s.player.z = v.z; s.player.hp = 40; ok(nearVending(s) && buySnack(s).includes('음료') && s.player.hp > 40, '자판기 음료'); } else console.log('· 자판기 소품 없음(건너뜀)');
}

// 5) 카지노
{
  const rng = makeRng(99); let w = 0; for (let i = 0; i < 20000; i++) w += slotSpin(rng, 10).payout - 10; ok(w > -20000 * 10 * 0.2 && w < 20000 * 10 * 0.02, `슬롯 기대값 합리적 (${(w / 200000 * 100).toFixed(1)}%)`);
  const rt = rouletteSpin(rng, 10, { type: 'number', n: 7 }); ok(rt.n >= 0 && rt.n <= 36, '룰렛'); ok(coinFlip(rng, 100, 'heads').payout % 1 === 0, '동전');
  let net = 0; for (let i = 0; i < 4000; i++) { const g = new Blackjack(rng, 10); while (!g.over && handValue(g.player) < 17) g.hit(); if (!g.over) g.stand(); net += g.payout - 10; } ok(net / 40000 > -0.2 && net / 40000 < 0.05, `블랙잭 기대값 합리적 (${(net / 400).toFixed(1)}%)`);
}
ok(ACHIEVEMENTS.length >= 20 && CAR_SHOP.length >= 10, '업적·차량 목록');
{ const s = new Sim(1); s.cash = 20000; buyProperty(s, 'store'); run(s, 2); ok(s.life.ach.includes('landlord') && s.life.ach.includes('rich_10k'), '업적 자동 지급'); }

console.log(failed ? `\n${failed}개 실패` : '\n모두 통과'); process.exit(failed ? 1 : 0);
