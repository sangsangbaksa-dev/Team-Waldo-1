import type { ActivityId, CreateSim, SlackEvent, SlackState, WatchMode } from './types';

const activities: Record<'class' | 'dorm', ActivityId[]> = {
  class: ['phone', 'manga', 'doodle', 'snack', 'sleep', 'note', 'music'],
  dorm: ['game', 'video', 'chat', 'webtoon', 'shop', 'music'],
};
const rates: Record<ActivityId, [number, number]> = {
  phone: [1.1, 0.14], manga: [0.95, 0.1], doodle: [0.75, 0.08], snack: [1.15, 0.25],
  sleep: [0.65, 0.04], note: [0.9, 0.16], music: [0.7, 0.08], game: [1.25, 0.15],
  video: [1.05, 0.13], chat: [0.9, 0.12], webtoon: [0.95, 0.1], shop: [0.9, 0.1],
};
const reasons: Record<ActivityId, string> = {
  phone: '폰 하다 걸림', manga: '만화 보다가 걸림', doodle: '낙서하다 걸림', snack: '과자 먹다 걸림',
  sleep: '엎드려 자다 걸림', note: '쪽지 주고받다 걸림', music: '음악 듣다 걸림', game: '게임 하다 걸림',
  video: '영상 보다가 걸림', chat: '메신저 하다 걸림', webtoon: '웹툰 보다가 걸림', shop: '쇼핑하다 걸림',
};
const clamp = (n: number, max = 100) => Math.max(0, Math.min(max, n));
const batteryActivities: ActivityId[] = ['phone', 'game', 'video'];

export const createSim: CreateSim = (stage, seed, level) => {
  let randomSeed = seed >>> 0;
  const random = () => {
    randomSeed = (randomSeed + 0x6d2b79f5) >>> 0;
    let x = randomSeed;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const range = (min: number, max: number) => min + random() * (max - min);
  const state: SlackState = {
    stage, level, phase: 'ready', time: 0, limit: 150, cover: true, activity: null,
    fun: 0, goal: [60, 75, 90][level - 1], sus: 0, sleepy: 0, study: 0, strikes: 0,
    combo: 1, score: 0, friend: 20, watcher: { mode: 'away', t: 0, prog: 0, hint: 0, near: 0 },
    battery: 100, grade: null, caughtBy: null,
  };
  let events: SlackEvent[] = [];
  let duration = range(12, 18) / (0.8 + level * 0.2);
  let forceCover = 0;
  let bribeCooldown = 0;
  let comboTime = 0;
  let comboBonus = 0;
  let funPending = 0;
  let footstepTimer = 0;
  let warned = false;
  let quiet = false;
  let sleepScanHit = false;
  let surprise = random() < 0.06 + level * 0.06;
  const setCover = (on: boolean) => {
    if (state.phase !== 'play' || (!on && forceCover > 0) || state.cover === on) return;
    state.cover = on;
    events.push({ t: 'cover', on });
  };
  const strike = (reason: string) => {
    state.strikes++;
    state.sus = 40;
    state.sleepy = Math.min(state.sleepy, 55);
    state.combo = 1;
    comboTime = 0;
    forceCover = 1.5;
    setCover(true);
    events.push({ t: 'strike', n: state.strikes, reason });
    if (state.strikes >= 3) {
      state.phase = 'caught';
      state.caughtBy = reason;
      events.push({ t: 'caught', reason });
    }
  };
  const enter = (mode: WatchMode) => {
    const w = state.watcher;
    w.mode = mode; w.t = 0; w.prog = 0;
    if (mode === 'away') {
      duration = range(12, 20) / (0.8 + level * 0.2);
      w.hint = 0; w.near = 0; warned = false; quiet = false;
      surprise = random() < 0.06 + level * 0.06;
      events.push({ t: 'door', open: false });
    } else if (mode === 'approach') {
      duration = range(3, 5) / (0.85 + level * 0.15); w.hint = 1; w.near = 0;
      footstepTimer = 0;
    } else if (mode === 'peek') {
      duration = range(1.5, 2.8); w.hint = 2; w.near = 0.2;
      events.push({ t: 'peek' });
    } else if (mode === 'scan') {
      duration = range(4, 7) / (0.9 + level * 0.1); w.hint = 2; sleepScanHit = false;
      events.push({ t: 'door', open: true }, { t: 'scan' });
    } else {
      duration = range(2, 3); w.hint = 1;
      events.push({ t: 'leave' });
    }
  };
  const score = () => Math.max(0, Math.round(state.fun * 10 + comboBonus + state.study * 3 - state.strikes * 150));
  const finish = () => {
    state.phase = 'done'; state.score = score();
    const quality = state.fun + state.study * 0.25 - state.strikes * 12 - state.sus * 0.12;
    state.grade = state.fun < state.goal ? (state.fun >= state.goal * 0.6 ? 'C' : 'D')
      : quality >= 100 ? 'S' : quality >= 80 ? 'A' : quality >= 60 ? 'B' : 'C';
    events.push({ t: 'done', grade: state.grade });
  };
  const tick = (dt: number) => {
    state.time = Math.min(state.limit, state.time + dt);
    forceCover = Math.max(0, forceCover - dt);
    bribeCooldown = Math.max(0, bribeCooldown - dt);
    const w = state.watcher;
    w.t += dt; w.prog = clamp(w.t / duration, 1);
    if (w.mode === 'away') {
      if (!warned && duration - w.t <= 1.6) {
        warned = true;
        if (random() < state.friend / 100 * 0.85) events.push({ t: 'friend-warn' });
      }
      if (!quiet && duration - w.t <= 0.5) {
        quiet = true;
        if (random() < 0.35) events.push({ t: 'quiet' });
      }
    } else if (w.mode === 'approach') {
      footstepTimer -= dt;
      if (footstepTimer <= 0) { events.push({ t: 'footstep', vol: 0.15 + w.prog * 0.85 }); footstepTimer = 0.5; }
    } else if (w.mode === 'scan') {
      w.near = Math.sin(Math.PI * w.prog);
    } else if (w.mode === 'leave') w.near = 0.2 * (1 - w.prog);
    if (w.t >= duration) {
      enter(w.mode === 'away' ? (surprise ? 'peek' : 'approach') : w.mode === 'approach' ? 'peek' : w.mode === 'peek' ? 'scan' : w.mode === 'scan' ? 'leave' : 'away');
    }
    const active = !state.cover ? state.activity : null;
    state.sleepy = clamp(state.sleepy + (active === 'sleep' ? -3 : stage === 'class' ? 0.35 : 0) * dt);
    if (state.sleepy >= 100) strike('졸다가 걸림');
    if (state.phase !== 'play') return;
    if (state.cover) {
      state.study = clamp(state.study + 0.6 * dt);
      state.sus = clamp(state.sus - 1.1 * dt);
      comboTime = 0; state.combo = 1;
    } else if (active) {
      comboTime += dt;
      state.combo = Math.min(5, 1 + Math.floor(comboTime / 12));
      const gain = Math.min(100 - state.fun, rates[active][0] * (1 + (state.combo - 1) * 0.15) * dt);
      state.fun = clamp(state.fun + gain); funPending += gain; comboBonus += gain * (state.combo - 1) * 2;
      state.sus = clamp(state.sus + rates[active][1] * dt);
      if (funPending >= 3) { events.push({ t: 'fun', amount: funPending, activity: active }); funPending = 0; }
      if (batteryActivities.includes(active) || active === 'music') {
        state.battery = clamp(state.battery - (active === 'music' ? 0.12 : 0.8) * dt);
        if (state.battery === 0 && batteryActivities.includes(active)) {
          state.activity = null; events.push({ t: 'activity', id: null }, { t: 'toast', text: '배터리가 다 떨어졌어요.' });
        }
      }
      if (w.mode === 'peek') state.sus = clamp(state.sus + 24 * dt);
      if (w.mode === 'scan') {
        state.sus = clamp(state.sus + (18 + 65 * w.near) * dt);
        if (active === 'sleep' && !sleepScanHit) { sleepScanHit = true; strike(reasons.sleep); }
      }
      if (state.phase === 'play' && state.sus >= 100) strike(reasons[active]);
    }
    state.score = score();
    if (state.phase === 'play' && state.time >= state.limit - 1e-8) { state.time = state.limit; finish(); }
  };
  return {
    state,
    start() { if (state.phase === 'ready') state.phase = 'play'; },
    update(dt) {
      if (state.phase !== 'play' || !Number.isFinite(dt) || dt <= 0) return;
      let remaining = Math.min(dt, state.limit - state.time);
      while (remaining > 1e-9 && state.phase === 'play') { const step = Math.min(0.1, remaining); tick(step); remaining -= step; }
    },
    setCover,
    doActivity(id) {
      if (state.phase !== 'play' || (id !== null && !activities[stage].includes(id))) return;
      if (id !== null && batteryActivities.includes(id) && state.battery <= 0) return;
      if (state.activity === id) return;
      state.activity = id; events.push({ t: 'activity', id });
    },
    bribe() {
      if (state.phase !== 'play' || bribeCooldown > 0) return false;
      state.friend = clamp(state.friend + 15); bribeCooldown = 8; return true;
    },
    drain() { const result = events; events = []; return result; },
  };
};

