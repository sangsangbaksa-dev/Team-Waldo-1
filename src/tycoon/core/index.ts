// 타이쿤 코어 진입점. 씬은 createCore() 하나만 쓰면 된다.
import { GAME_MIN_PER_SEC, SPOTS } from './data';
import { buildActions, type ActionCtx } from './actions';
import { SPOT_BY_ID, newGame, type ActivityData, type GameData } from './model';
import { restoreGame, serializeGame } from './save';
import { advanceMinute, checkStage, spotUnlocked, type SimContext } from './sim';
import { buildState, lotView } from './view';
import type { ActionResult, CoreEvent, LotView, SpotDef, TycoonCore, TycoonState } from './types';

export type * from './types';
export { STAGES, STAGE_NAMES, SPOTS, SHOP_KINDS, DISTRICTS, REGIONS, RIVALS, GAME_MIN_PER_SEC } from './data';
export { TYCOON_SAVE_KEY, loadTycoon, saveTycoon, clearTycoon, readTycoonSummary } from './save';
export { fmt as formatMoney } from './sim';

export interface CoreOptions {
  /** serialize() 로 얻은 값(또는 loadTycoon()). 깨졌으면 새 게임 */
  save?: unknown;
  seed?: number;
}

/** 한 tick 에 처리하는 최대 실시간(탭 전환 후 몰아치기 방지) */
const MAX_DT = 0.25;

export function createCore(opts: CoreOptions = {}): TycoonCore & { /** 테스트·디버그용 내부 상태 */ readonly data: GameData } {
  const g = (opts.save !== undefined && restoreGame(opts.save)) || newGame(opts.seed);
  const sim: SimContext = { presence: null, asleep: false };
  let activity: ActivityData | null = null;
  let speed: 1 | 2 | 4 = 1;
  let carry = 0;
  let lateWarned = '';
  let dirty = true;
  let snapshot: TycoonState | null = null;
  const subs = new Set<(s: TycoonState) => void>();
  const listeners = new Set<(e: CoreEvent) => void>();

  // UI 이벤트(특히 자동 저장)는 변경이 모두 끝난 뒤 발행한다.
  const pending: CoreEvent[] = [];
  const emit = (e: CoreEvent) => { dirty = true; pending.push(e); };
  const ctx: ActionCtx = {
    g, emit,
    skipMinutes: (n) => {
      sim.asleep = true;
      try { for (let i = 0; i < n; i++) advanceMinute(g, sim, emit); }
      finally { sim.asleep = false; dirty = true; }
    },
  };

  const state = (): TycoonState => {
    if (dirty || !snapshot) {
      snapshot = buildState(g, { presence: sim.presence, activity, speed });
      dirty = false;
    }
    return snapshot;
  };
  const notify = () => {
    if (!subs.size) return;
    const s = state();
    for (const fn of subs) fn(s);
  };

  const publish = () => {
    const changed = dirty || pending.length > 0;
    for (const event of pending.splice(0)) for (const fn of listeners) fn(event);
    if (changed) notify();
  };

  const finishActivity = () => {
    const a = activity!;
    activity = null;
    dirty = true;
    // 완료 시점에 다시 검사(그 사이 돈이나 시간이 바뀌었을 수 있다)
    const now = buildActions(ctx, a.spotId).find(x => x.id === a.actionId);
    if (!now?.enabled) {
      emit({ type: 'toast', text: now?.disabledReason ?? '할 수 없게 되었습니다', tone: 'bad' });
      return;
    }
    const msg = now.run();
    checkStage(g, emit);
    if (msg) emit({ type: 'toast', text: msg, tone: 'good' });
  };

  const core = {
    get state() { return state(); },
    get data() { return g; },
    tick(dtSec: number) {
      if (!Number.isFinite(dtSec) || dtSec <= 0) return;
      const dt = Math.min(MAX_DT, dtSec);
      if (activity) {
        activity.elapsed += dt;
        dirty = true;
        if (activity.elapsed >= activity.duration) finishActivity();
      }
      carry += dt * GAME_MIN_PER_SEC * speed;
      const whole = Math.floor(carry);
      if (whole > 0) {
        carry -= whole;
        for (let i = 0; i < whole; i++) advanceMinute(g, sim, emit);
        if (g.task && g.task.id !== lateWarned && g.task.deadline < (g.day - 1) * 1440 + g.minute) {
          lateWarned = g.task.id;
          emit({ type: 'toast', text: '배달 시간이 지났습니다. 그래도 가져다주면 절반은 받습니다', tone: 'bad' });
        }
        dirty = true;
      }
      publish();
    },
    spots() {
      return SPOTS.map(s => ({ ...(s.kind === 'lot' ? lotView(g, s, sim.presence) : s), locked: !spotUnlocked(g, s) }));
    },
    spot(id: string): SpotDef | LotView | undefined {
      const s = SPOT_BY_ID.get(id);
      if (!s) return undefined;
      return s.kind === 'lot' ? lotView(g, s, sim.presence) : s;
    },
    actionsAt(spotId: string) {
      return buildActions(ctx, spotId).map(({ run: _run, lockMovement: _lock, ...def }) => def);
    },
    perform(spotId: string, actionId: string): ActionResult {
      if (activity) return { ok: false, message: `${activity.label} 하는 중입니다` };
      const a = buildActions(ctx, spotId).find(x => x.id === actionId);
      if (!a) return { ok: false, message: '여기서는 할 수 없습니다' };
      if (!a.enabled) return { ok: false, message: a.disabledReason ?? '할 수 없습니다' };
      if (a.durationSec > 0) {
        activity = { spotId, actionId, label: a.label, elapsed: 0, duration: a.durationSec, lockMovement: a.lockMovement };
        dirty = true;
        notify();
        return { ok: true, message: `${a.label}...` };
      }
      const msg = a.run();
      checkStage(g, emit);
      dirty = true;
      publish();
      return { ok: true, message: msg };
    },
    cancelActivity() {
      if (!activity) return;
      activity = null;
      dirty = true;
      notify();
    },
    setPresence(spotId: string | null) {
      const id = spotId && SPOT_BY_ID.has(spotId) ? spotId : null;
      if (id === sim.presence) return;
      sim.presence = id;
      if (activity && activity.spotId !== id) { activity = null; }
      dirty = true;
      notify();
    },
    setSpeed(s: 1 | 2 | 4) {
      const next = s === 2 || s === 4 ? s : 1;
      if (next === speed) return;
      speed = next;
      dirty = true;
      notify();
    },
    subscribe(fn: (s: TycoonState) => void) { subs.add(fn); return () => { subs.delete(fn); }; },
    onEvent(fn: (e: CoreEvent) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    serialize() { return serializeGame(g); },
  };
  return core;
}

