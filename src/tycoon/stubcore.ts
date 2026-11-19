// 코어 엔진(core/index.ts)이 합쳐지기 전에 월드/UI 를 돌려 보기 위한 임시 코어. 엔진이 들어오면 game.ts 가 그쪽을 씁니다.
import { GAME_MIN_PER_SEC, SPOTS, STAGES, STAGE_NAMES, stageIndex } from './core/data';
import type { ActionDef, CoreEvent, LotView, SpotDef, Stage, TycoonCore, TycoonState } from './core/types';

const LADDER: Array<[Stage, number]> = [['broke', 0], ['parttime', 150], ['smallshop', 1200], ['bigshop', 9000], ['business', 70000], ['corp', 600000], ['world', 6000000]];

export function createStubCore(): TycoonCore {
  let s: TycoonState = {
    day: 1, minutes: 6 * 60, clock: '06:00', night: false, cash: 20, debt: 0, energy: 100, stage: 'broke', stageIndex: 0, stageName: STAGE_NAMES.broke, reputation: 0, netWorth: 20, bottles: 0, cargo: null,
    owned: [], activity: null, task: null, goal: { next: 'parttime', label: '150원 모으기', progress: 0, steps: [] }, rivals: [], regions: [], events: [], lastReport: null, presence: null, incorporated: false, listed: false, won: false, speed: 1,
  };
  const subs = new Set<(x: TycoonState) => void>(), evs = new Set<(e: CoreEvent) => void>(), owners = new Map<string, 'player'>();
  let act: { spotId: string; id: string; left: number; total: number; pay: number; label: string } | null = null;
  const emit = (e: CoreEvent): void => { for (const f of evs) f(e); };
  const push = (p: Partial<TycoonState>): void => { s = { ...s, ...p }; for (const f of subs) f(s); };
  const locked = (d: SpotDef): boolean => stageIndex(d.minStage) > s.stageIndex;
  const view = (d: SpotDef): SpotDef & { locked: boolean } | (LotView & { locked: boolean }) => d.kind === 'lot'
    ? { ...d, kind: 'lot', size: d.size ?? 'S', price: 300, owner: owners.has(d.id) ? 'player' : 'none', locked: locked(d), shop: owners.has(d.id) ? { spotId: d.id, kind: 'stall', kindName: '포장마차', name: '내 포장마차', level: 1, maxLevel: 2, priceMult: 1, stock: 50, stockCap: 80, rating: 50, staff: [], serving: true, todayRevenue: 0, todayCustomers: 0, todayLost: 0, profitPerDay: 0, value: 200, busy: 0.5 } : undefined }
    : { ...d, locked: locked(d) };
  const actions = (id: string): ActionDef[] => {
    const d = SPOTS.find(x => x.id === id); if (!d) return [];
    const mk = (a: string, label: string, desc: string, cost: number, reward: number, sec: number, ok = true): ActionDef => ({ id: a, label, desc, cost, reward, energy: reward ? 10 : -20, durationSec: sec, enabled: ok && !locked(d) && !act && s.cash >= cost, disabledReason: locked(d) ? '아직 열리지 않았습니다' : s.cash < cost ? '돈이 모자랍니다' : undefined });
    switch (d.kind) {
      case 'home': return [mk('sleep', '잠자기', '에너지를 채웁니다.', 0, 0, 3)];
      case 'food': return [mk('eat', '한 끼 먹기', '에너지 +30', 8, 0, 2)];
      case 'job': return [mk('work', '일하기', '일당을 받습니다.', 0, 30, 4)];
      case 'scrap': return [mk('scrap', '빈 병 줍기', '병을 줍습니다.', 0, 6, 3)];
      case 'lot': return owners.has(id) ? [mk('sell', '장사하기', '직접 팔아 번다.', 0, 25, 4)] : [mk('buy', '부지 사기', '300원', 300, 0, 0)];
      default: return [];
    }
  };
  const refresh = (): void => {
    let st: Stage = 'broke'; for (const [id, need] of LADDER) if (s.cash >= need) st = id;
    const next = LADDER[Math.min(LADDER.length - 1, stageIndex(st) + 1)];
    if (st !== s.stage) { emit({ type: 'stage', text: `${STAGE_NAMES[st]} 단계!`, stage: st }); }
    push({ stage: st, stageIndex: stageIndex(st), stageName: STAGE_NAMES[st], netWorth: Math.floor(s.cash), goal: { next: st === 'world' ? null : STAGES[stageIndex(st) + 1], label: `${next[1].toLocaleString()}원 모으기`, progress: Math.min(1, s.cash / Math.max(1, next[1])), steps: [] } });
  };
  return {
    get state() { return s; },
    tick(dt) {
      const dm = dt * GAME_MIN_PER_SEC * s.speed, m = s.minutes + dm, h = m / 60 % 24;
      push({ minutes: m % 1440, day: s.day + (m >= 1440 ? 1 : 0), clock: `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`, night: h >= 20 || h < 6 });
      if (act) {
        act.left -= dt; const a = act;
        if (a.left <= 0) { act = null; push({ activity: null, cash: s.cash + a.pay, energy: Math.max(0, Math.min(100, s.energy + (a.id === 'sleep' ? 100 : a.id === 'eat' ? 30 : -10))) }); if (a.pay) emit({ type: 'cash', text: `+${a.pay}`, amount: a.pay }); refresh(); }
        else push({ activity: { spotId: a.spotId, actionId: a.id, label: a.label, progress: 1 - a.left / a.total, lockMovement: true } });
      }
    },
    spots: () => SPOTS.map(view), spot: id => SPOTS.find(x => x.id === id),
    actionsAt: actions,
    perform(spotId, actionId) {
      const def = actions(spotId).find(x => x.id === actionId); if (!def || !def.enabled) return { ok: false, message: def?.disabledReason ?? '할 수 없습니다' };
      push({ cash: s.cash - def.cost });
      if (actionId === 'buy') { owners.set(spotId, 'player'); refresh(); return { ok: true, message: '부지를 샀습니다' }; }
      act = { spotId, id: actionId, left: def.durationSec, total: def.durationSec, pay: def.reward, label: def.label }; push({ activity: { spotId, actionId, label: def.label, progress: 0, lockMovement: true } });
      return { ok: true, message: def.label };
    },
    cancelActivity() { act = null; push({ activity: null }); },
    setPresence(id) { if (s.presence !== id) push({ presence: id }); },
    setSpeed(v) { push({ speed: v }); },
    subscribe(fn) { subs.add(fn); fn(s); return () => { subs.delete(fn); }; },
    onEvent(fn) { evs.add(fn); return () => { evs.delete(fn); }; },
    serialize: () => ({ v: 1, cash: s.cash, stage: s.stage, day: s.day }),
  };
}
