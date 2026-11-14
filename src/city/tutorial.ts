// LAST CITY — 튜토리얼 단계 정의. DOM에 의존하지 않아 헤드리스 테스트가 가능합니다.
import { BIZ, type BizKind } from './defs';
import { clearLine, navBlocked } from './map';
import type { World } from './world';

export interface Counters { move: number; look: number; orders: number; viewSwitches: number; vehicleDist: number; sells: number; entered: boolean; acked: boolean }
export const newCounters = (): Counters => ({ move: 0, look: 0, orders: 0, viewSwitches: 0, vehicleDist: 0, sells: 0, entered: false, acked: false });
export interface TutState { i: number; enemies: number[]; lootId: number; vehId: number; bizId: number }
export const newTutState = (): TutState => ({ i: 0, enemies: [], lootId: 0, vehId: 0, bizId: 0 });
export interface TutCtx { w: World; c: Counters; s: TutState; yaw: number }
export interface Marker { x: number; y: number; h: number; text: string }
export interface TutStep {
  title: string; body: string; touch?: string; pulse?: string[]; info?: boolean;
  enter?: (x: TutCtx) => void; progress?: (x: TutCtx) => [number, number]; done: (x: TutCtx) => boolean; marker?: (x: TutCtx) => Marker | null;
}

const k = (t: string): string => `<kbd>${t}</kbd>`;
const price = (kind: BizKind): number => BIZ[kind].price;

/** 보스 앞쪽(yaw) 근처의 걸을 수 있는 빈 자리를 찾습니다. */
export function freeSpot(w: World, yaw: number, minR: number, maxR: number, spread = 0.9): { x: number; y: number } {
  const b = w.boss(0)!;
  for (let n = 0; n < 80; n++) {
    const a = yaw + (w.rng() - 0.5) * 2 * spread * (n < 40 ? 1 : 3), r = minR + w.rng() * (maxR - minR), x = b.x + Math.cos(a) * r, y = b.y + Math.sin(a) * r;
    if (!navBlocked(w.map, x, y) && (n > 40 || clearLine(w.map, b.x, b.y, x, y))) return { x, y };
  }
  return { x: b.x + 40, y: b.y + 40 };
}
const aliveCount = (w: World, ids: number[]): number => ids.filter(id => w.byId.get(id)?.alive).length;
const armyCount = (w: World): number => w.actors.filter(a => a.alive && a.f === 0 && a.kind === 'rifle').length;

export const STEPS: TutStep[] = [
  { title: 'LAST CITY에 오신 것을 환영합니다', info: true,
    body: '여덟 왕국이 한 도시에 떨어졌습니다. <b>직접 총을 들고 싸우고</b>, <b>사업체로 돈을 벌고</b>, <b>군대를 키워</b> 마지막 왕국이 되세요. 지금부터 약 5분 동안 핵심만 하나씩 익힙니다. 이 연습장에서는 자기장이 멈춰 있고 라이벌은 움직이지 않으니 편하게 따라오세요.',
    done: x => x.c.acked },
  { title: '1. 이동과 시점',
    body: `${k('W')}${k('A')}${k('S')}${k('D')}로 걷고, <b>마우스</b>로 주변을 둘러보세요. 화면 가운데 십자선이 조준점입니다. (마우스가 잠겼다면 ${k('Esc')}로 풀 수 있어요)`,
    touch: '<b>왼쪽 화면</b>을 드래그해 걷고, <b>오른쪽 화면</b>을 드래그해 시점을 돌리세요.',
    progress: x => [Math.min(1, x.c.move / 120) * 0.5 + Math.min(1, x.c.look / 1.2) * 0.5, 1], done: x => x.c.move >= 120 && x.c.look >= 1.2 },
  { title: '2. 시점 바꾸기', pulse: ['#c-view'],
    body: `${k('V')}를 눌러 <b>1인칭 → 3인칭 → 전술 탑뷰</b>를 돌아보세요. 세 번 누르면 한 바퀴입니다. 차량을 타면 추격 카메라로 자동 전환됩니다.`,
    touch: '오른쪽 위의 <b>시점 버튼</b>을 세 번 눌러 한 바퀴 돌려 보세요.',
    progress: x => [Math.min(3, x.c.viewSwitches), 3], done: x => x.c.viewSwitches >= 3 },
  { title: '3. 사격과 전투',
    body: `<b>좌클릭</b>으로 사격, ${k('R')} 재장전, ${k('1')}~${k('3')} 무기 교체, 마우스 휠로도 바꿉니다. 십자선이 <b>붉게</b> 변하면 적을 조준한 것입니다. 앞에 서 있는 적 3명을 처치하세요.`,
    touch: '오른쪽 아래 <b>사격 버튼</b>을 누르고 있으면 쏩니다. 하단 <b>무기</b> 버튼으로 교체하세요. 앞에 서 있는 적 3명을 처치하세요.',
    enter: x => {
      x.s.enemies = [];
      for (let n = 0; n < 3; n++) { const p = freeSpot(x.w, x.yaw, 260, 420, 0.7), a = x.w.spawnActor('rifle', 1, p.x, p.y); a.order = { type: 'hold', x: p.x, y: p.y }; a.maxHp = a.hp = 60; x.s.enemies.push(a.id); }
    },
    progress: x => [3 - aliveCount(x.w, x.s.enemies), 3], done: x => x.s.enemies.length > 0 && aliveCount(x.w, x.s.enemies) === 0,
    marker: x => { const a = x.s.enemies.map(id => x.w.byId.get(id)).find(q => q?.alive); return a ? { x: a.x, y: a.y, h: 70, text: '적' } : null; } },
  { title: '4. 무기 줍기',
    body: `바닥에서 빛나는 무기에 다가가 ${k('E')}로 줍습니다. 무기는 <b>최대 3개</b>까지 들 수 있고 새 무기는 자동으로 손에 듭니다. 실전에서는 <b>보급 수송기</b>가 전설 무기 상자를 떨어뜨립니다.`,
    touch: '빛나는 무기 위에서 <b>E</b> 버튼을 누르세요.',
    enter: x => { const p = freeSpot(x.w, x.yaw, 120, 220, 1.2); x.s.lootId = x.w.spawnLoot('weapon', p.x, p.y, 0, 'rifle').id; },
    done: x => x.w.factions[0].slots.some(q => q.id === 'rifle'),
    marker: x => { const l = x.w.loot.find(q => q.id === x.s.lootId && q.alive); return l ? { x: l.x, y: l.y, h: 50, text: '돌격소총' } : null; } },
  { title: '5. 사업체 사기',
    body: `<b>점선 원</b> 위에 서서 ${k('E')}를 누르면 <b>건물 안으로 들어갑니다</b>. 안쪽 <b>카운터 앞</b>에서 ${k('E')}로 거래 창을 열어 사업체를 매입하세요. 사업체는 <b>초당 수입</b>을 만들고, 업그레이드하면 <b>본부에서 경비병이 걸어와</b> 지켜 줍니다. 나갈 때는 초록 EXIT 문 앞에서 ${k('E')}. 적 사업체는 패드 위에서 6초 버티면 빼앗을 수 있어요.`,
    touch: '표시된 원 위에서 <b>E</b> 버튼으로 들어가 카운터 앞에서 다시 <b>E</b>를 누르세요.',
    enter: x => {
      const b = x.w.boss(0)!; let best: number | null = null, bd = 1e9;
      for (const z of x.w.businesses) if (z.owner < 0 && z.kind !== 'gunshop' && price(z.kind) <= 900) { const d = Math.hypot(z.x - b.x, z.y - b.y); if (d < bd) { bd = d; best = z.id; } }
      x.s.bizId = best ?? 0; x.w.factions[0].cash = Math.max(x.w.factions[0].cash, 1200);
    },
    done: x => x.w.businesses.some(z => z.owner === 0),
    marker: x => { const z = x.w.businesses.find(q => q.id === x.s.bizId); return z ? { x: z.x, y: z.y, h: 90, text: `${BIZ[z.kind].name} $${BIZ[z.kind].price}` } : null; } },
  { title: '6. 기지 짓기', pulse: ['.c-cmd-main', '#c-touch [data-act="panel"]', '[data-act="tab:build"]', '[data-act="build:barracks"]'],
    body: `${k('Tab')}으로 <b>지휘 패널</b>을 열고 ▸ <b>건설</b> ▸ <b>병영</b>을 고른 뒤, 본부 근처 빈 땅을 <b>클릭</b>해 짓습니다. 초록 윤곽이 뜨면 지을 수 있는 곳입니다. (우클릭으로 취소)`,
    touch: '오른쪽 아래 <b>지휘</b> 버튼 ▸ 건설 ▸ 병영을 고르고, 지을 곳을 화면에서 누르세요.',
    enter: x => { const f = x.w.factions[0]; f.crystal = Math.max(f.crystal, 450); },
    done: x => x.w.structures.some(s => s.alive && s.f === 0 && s.kind === 'barracks'),
    marker: x => { const h = x.w.hq(0); return h ? { x: h.x + 60, y: h.y + 60, h: 180, text: '본부 근처에 건설' } : null; } },
  { title: '7. 병력 훈련', pulse: ['.c-cmd-main', '#c-touch [data-act="panel"]', '[data-act="tab:train"]', '[data-act="train:rifle"]'],
    body: '병영이 완공되면(약 15초) 지휘 패널 ▸ <b>생산</b>에서 <b>소총병을 3명</b> 훈련하세요. 크리스탈은 일꾼이 자동으로 캐옵니다. 인구 한도는 <b>보급고</b>로 늘립니다.',
    touch: '<b>지휘</b> ▸ 생산 ▸ 소총병을 3번 누르세요.',
    enter: x => { const f = x.w.factions[0]; f.crystal = Math.max(f.crystal, 300); },
    progress: x => [Math.min(3, armyCount(x.w)), 3], done: x => armyCount(x.w) >= 3 },
  { title: '8. 병력 지휘',
    body: `부하는 기본적으로 나를 따라옵니다. ${k('X')} <b>사수</b>(제자리 방어), ${k('Z')} <b>집결</b>, <b>우클릭</b>(또는 ${k('C')}) <b>조준한 곳으로 돌격</b> — 명령을 세 번 내려 보세요. 지도(${k('M')})를 눌러 돌격 지점을 찍을 수도 있어요.`,
    touch: '하단의 <b>사수 · 집결 · 돌격</b> 버튼을 세 번 눌러 보세요.',
    progress: x => [Math.min(3, x.c.orders), 3], done: x => x.c.orders >= 3 },
  { title: '9. 차량 타기',
    body: `차량 근처에서 ${k('F')}로 <b>탑승</b>합니다. 달리는 차는 시민과 적을 칠 수 있지만, 남의 차를 빼앗거나 시민을 해치면 <b>수배 ★</b>가 올라 경찰이 쫓아옵니다. ${k('Space')} 핸드브레이크. 250m쯤 달린 뒤 ${k('F')}로 내리세요.`,
    touch: '차량 옆에서 <b>차량</b> 버튼으로 타고, 왼쪽 드래그로 운전하세요. 250m쯤 달린 뒤 다시 눌러 내리세요.',
    enter: x => {
      const b = x.w.boss(0)!; let best = 0, bd = 900;
      for (const v of x.w.vehicles) if (v.alive && !v.driver && v.ai !== 'chase' && v.kind !== 'tank') { const d = Math.hypot(v.x - b.x, v.y - b.y); if (d < bd) { bd = d; best = v.id; } }
      if (!best) { const p = freeSpot(x.w, x.yaw, 120, 200, 1); best = x.w.spawnVehicle('sedan', p.x, p.y, x.yaw).id; }
      x.s.vehId = best;
    },
    progress: x => [Math.min(250, x.c.vehicleDist), 250], done: x => x.c.vehicleDist >= 250 && !x.w.boss(0)?.inVeh,
    marker: x => { const v = x.w.vehicles.find(q => q.id === x.s.vehId && q.alive); return v && !x.w.boss(0)?.inVeh ? { x: v.x, y: v.y, h: 70, text: '차량' } : null; } },
  { title: '10. 크리스탈 시장', pulse: ['.c-cmd-main', '#c-touch [data-act="panel"]', '[data-act="tab:market"]', '[data-act="sell:50"]'],
    body: '지휘 패널 ▸ <b>시장</b>에서 크리스탈을 현금으로 바꾸거나, 시세가 낮을 때 사 둘 수 있습니다. 시세는 계속 흔들리고 가끔 <b>급등·폭락</b>합니다. 크리스탈 <b>50개를 팔아</b> 보세요.',
    touch: '<b>지휘</b> ▸ 시장 ▸ 50 판매를 누르세요.',
    enter: x => { const f = x.w.factions[0]; f.crystal = Math.max(f.crystal, 120); },
    done: x => x.c.sells >= 1 },
  { title: '11. 승리 조건', info: true,
    body: '적 본부를 부수면 그 보스는 <b>부활하지 못하고</b>, 마지막까지 남은 왕국이 승리합니다. 제한 시간이 끝나면 <b>자산(순자산)</b>이 가장 큰 왕국이 이깁니다. 사업체를 늘리고 병력을 지키며 경제를 굴리세요.',
    done: x => x.c.acked },
];

/** 현재 단계가 끝났으면 다음 단계로 넘기고 true를 돌려줍니다. */
export function advance(x: TutCtx): boolean {
  const step = STEPS[x.s.i]; if (!step || !step.done(x)) return false;
  x.s.i++; x.c.acked = false; const next = STEPS[x.s.i]; if (next?.enter) next.enter(x);
  return true;
}
export const TUT_KEY = 'waldo.city.tutorial.v1';
