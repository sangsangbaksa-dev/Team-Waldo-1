// 코어가 합쳐지기 전에 월드/UI 를 돌려 보기 위한 임시 코어. 실제 코어(src/tycoon/core)가 들어오면 game.ts 가 그쪽을 씁니다.
import { STAGE_IDS, stageIndex, type ActionDef, type SpotDef, type StageId, type TycoonCore, type TycoonEvent, type TycoonSnapshot } from './bridge';

const SPOTS: SpotDef[] = [
  { id: 'shelter', kind: 'home', name: '쪽방 쉼터', minStage: 'broke' },
  { id: 'dayjob', kind: 'job', name: '인력사무소', minStage: 'broke' },
  { id: 'noodle', kind: 'food', name: '분식집', minStage: 'broke' },
  { id: 'cvs', kind: 'job', name: '편의점', minStage: 'parttime' },
  { id: 'cafe', kind: 'job', name: '카페', minStage: 'parttime' },
  { id: 'myshop', kind: 'shop', name: '내 가게', minStage: 'smallshop' },
  { id: 'wholesale', kind: 'market', name: '도매시장', minStage: 'smallshop' },
  { id: 'bank', kind: 'bank', name: '은행', minStage: 'bigshop' },
  { id: 'mart', kind: 'shop', name: '대형 마트', minStage: 'bigshop' },
  { id: 'office', kind: 'office', name: '사업 본부', minStage: 'business' },
  { id: 'factory', kind: 'factory', name: '공장', minStage: 'business' },
  { id: 'hq', kind: 'hq', name: '본사 빌딩', minStage: 'corp' },
  { id: 'port', kind: 'port', name: '국제 항만', minStage: 'world' },
];
const LADDER: Array<[StageId, number]> = [['broke', 0], ['parttime', 150], ['smallshop', 1200], ['bigshop', 9000], ['business', 70000], ['corp', 600000], ['world', 6000000]];

export function createStubCore(save?: unknown): TycoonCore {
  const s: TycoonSnapshot = { day: 1, minutes: 8 * 60, cash: 20, energy: 100, stage: 'broke', reputation: 0, netWorth: 20, owned: [], activity: null, goal: null };
  const saved = save as Partial<TycoonSnapshot> | undefined;
  if (saved && typeof saved.cash === 'number') Object.assign(s, { day: saved.day ?? 1, minutes: saved.minutes ?? 480, cash: saved.cash, energy: saved.energy ?? 100, stage: saved.stage ?? 'broke' });
  const subs = new Set<(x: TycoonSnapshot) => void>(), evs = new Set<(e: TycoonEvent) => void>();
  let act: { id: string; left: number; total: number; pay: number; cost: number; label: string } | null = null;
  const emit = (e: TycoonEvent): void => { for (const f of evs) f(e); };
  const refresh = (): void => {
    s.netWorth = Math.floor(s.cash);
    let st: StageId = 'broke'; for (const [id, need] of LADDER) if (s.cash >= need) st = id;
    if (stageIndex(st) > stageIndex(s.stage)) { s.stage = st; emit({ type: 'stage', text: `단계 상승!`, stage: st }); }
    const next = LADDER[Math.min(LADDER.length - 1, stageIndex(s.stage) + 1)];
    s.goal = { label: `${next[1].toLocaleString()}원 모으기`, progress: Math.min(1, s.cash / Math.max(1, next[1])) };
    for (const f of subs) f(s);
  };
  const actions = (id: string): ActionDef[] => {
    const spot = SPOTS.find(x => x.id === id); if (!spot) return [];
    const unlocked = stageIndex(spot.minStage) <= stageIndex(s.stage), why = unlocked ? undefined : '아직 열리지 않았습니다';
    const mk = (a: string, label: string, desc: string, cost: number, sec: number): ActionDef => ({ id: `${id}:${a}`, label, desc, cost, durationSec: sec, enabled: unlocked && !act && s.cash >= cost && (a !== 'work' || s.energy >= 15), disabledReason: why ?? (s.cash < cost ? '돈이 모자랍니다' : undefined) });
    switch (spot.kind) {
      case 'home': return [mk('sleep', '잠자기', '에너지를 가득 채웁니다.', 0, 4)];
      case 'food': return [mk('eat', '한 끼 먹기', '에너지 +30', 8, 2)];
      case 'job': return [mk('work', '일하기', '시급을 받습니다.', 0, 4)];
      default: return [mk('work', '장사하기', '수익을 올립니다.', 0, 4)];
    }
  };
  return {
    state: s,
    tick(dt) {
      s.minutes += dt * 1.2; if (s.minutes >= 1440) { s.minutes -= 1440; s.day++; emit({ type: 'day', text: `${s.day}일째` }); }
      if (act) { act.left -= dt; s.activity = { id: act.id, label: act.label, progress: 1 - Math.max(0, act.left) / act.total, lockMovement: true }; if (act.left <= 0) { s.cash += act.pay; if (act.pay) emit({ type: 'cash', text: `+${act.pay}원`, amount: act.pay }); act = null; s.activity = null; refresh(); } for (const f of subs) f(s); }
    },
    subscribe(fn) { subs.add(fn); fn(s); return () => { subs.delete(fn); }; },
    onEvent(fn) { evs.add(fn); return () => { evs.delete(fn); }; },
    spots: () => SPOTS,
    actionsAt: actions,
    perform(actionId) {
      const [sid, a] = actionId.split(':'), def = actions(sid).find(x => x.id === actionId);
      if (!def || !def.enabled) return { ok: false, message: def?.disabledReason ?? '할 수 없습니다' };
      s.cash -= def.cost;
      if (a === 'sleep') { s.energy = 100; s.minutes = (s.minutes + 360) % 1440; }
      if (a === 'eat') s.energy = Math.min(100, s.energy + 30);
      const spot = SPOTS.find(x => x.id === sid)!, pay = a === 'work' ? Math.round((10 + stageIndex(spot.minStage) * 12 + stageIndex(s.stage) * 6) * (1 + stageIndex(s.stage))) : 0;
      if (a === 'work') s.energy -= 12;
      act = { id: actionId, left: def.durationSec, total: def.durationSec, pay, cost: def.cost, label: def.label }; s.activity = { id: actionId, label: def.label, progress: 0, lockMovement: true }; refresh();
      return { ok: true, message: def.label };
    },
    serialize: () => ({ v: 1, day: s.day, minutes: s.minutes, cash: s.cash, energy: s.energy, stage: s.stage }),
  };
}
void STAGE_IDS;
