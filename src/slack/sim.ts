import type { ActivityId, CreateSim, SlackEvent, SlackState, WatchMode, WatcherKind } from './types';

export const GOALS = [46, 54, 62] as const;

const activities: Record<'class' | 'dorm', ActivityId[]> = {
  class: ['video', 'game'],
  dorm: ['game', 'video', 'chat', 'webtoon', 'shop', 'music'],
};
const rates: Record<ActivityId, [number, number]> = {
  game: [1.25, 0.15], video: [1.05, 0.13], chat: [0.9, 0.12], webtoon: [0.95, 0.1], shop: [0.9, 0.1], music: [0.7, 0.08],
};
const reasons: Record<ActivityId, string> = {
  game: '게임 하다 걸림', video: '영상 보다가 걸림', chat: '메신저 하다 걸림', webtoon: '웹툰 보다가 걸림', shop: '쇼핑하다 걸림', music: '음악 듣다 걸림',
};
/** 교실(학교 노트북): game 은 소리·화면 움직임이 커서 재미 큼+위험 큼, video 는 안전하지만 재미 적음 */
const classRates: Partial<Record<ActivityId, [number, number]>> = { game: [1.1, 0.2], video: [0.7, 0.08] };
const classVis: Partial<Record<ActivityId, number>> = { game: 1.25, video: 0.75 };
const classNoise: Partial<Record<ActivityId, number>> = { game: 0.7, video: 0.12 };
const classReasons: Partial<Record<ActivityId, string>> = { game: '수업 중 게임하다 걸림', video: '수업 중 영상 보다가 걸림' };
const RATE = 0.6; // 전체 재미 속도 보정(헤드리스 시뮬로 클리어율 맞춤)
const clamp = (n: number, max = 100) => Math.max(0, Math.min(max, n));
const batteryActivities: ActivityId[] = ['game', 'video', 'music'];
/** 활동별 개성: noise 접근 중 소음(들킬 위험), vis 감독이 볼 때 눈에 띄는 정도 */
const noise: Partial<Record<ActivityId, number>> = { game: 0.5, video: 0.3, chat: 0.2 };
const vis: Record<ActivityId, number> = { game: 1.2, video: 1.1, chat: 0.9, webtoon: 0.9, shop: 0.8, music: 0.7 };
const online: ActivityId[] = ['game', 'video', 'chat', 'webtoon', 'shop'];
/** 감독 성향 가중치(레벨별): regular, erratic, sneaky */
const kindWeights: [number, number, number][] = [[0.75, 0.2, 0.05], [0.4, 0.4, 0.2], [0.15, 0.4, 0.45]];

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
    fun: 0, goal: GOALS[level - 1], sus: 0, sleepy: 0, study: 0, strikes: 0,
    combo: 1, score: 0, friend: 20, watcher: { mode: 'away', t: 0, prog: 0, hint: 0, near: 0 },
    battery: 100, grade: null, caughtBy: null,
  };
  let events: SlackEvent[] = [];
  const isClass = stage === 'class';
  const R = isClass ? { ...rates, ...classRates } : rates;
  const V = isClass ? { ...vis, ...classVis } : vis;
  const N = isClass ? { ...noise, ...classNoise } : noise;
  const why = isClass ? { ...reasons, ...classReasons } : reasons;
  const pace = 0.7 + level * 0.3;
  const mate = '룸메'; // 교실엔 짝꿍·쪽지·경고가 없다(기숙사 전용)
  const requestAct: ActivityId = 'chat';
  const pickKind = (): WatcherKind => {
    const [a, b] = kindWeights[level - 1]; const r = random();
    return r < a ? 'regular' : r < a + b ? 'erratic' : 'sneaky';
  };
  /** 순찰 간격: regular 는 일정, erratic 은 들쭉날쭉, 후반일수록 짧아짐(난이도 곡선) */
  const awayTime = (kind: WatcherKind) => {
    const ramp = 1 - state.time / state.limit * (0.1 + 0.06 * level);
    return (kind === 'regular' ? range(13, 16) : kind === 'erratic' ? range(6, 26) : range(10, 20)) / pace * ramp;
  };
  const surpriseOf = (kind: WatcherKind) => random() < (kind === 'sneaky' ? 0.45 : kind === 'erratic' ? 0.04 * level : 0);
  state.watcher.kind = pickKind();
  let duration = awayTime(state.watcher.kind);
  let streak = 0, novelty = 0, lastAct: ActivityId | null = null, boredToast = false;
  const used = new Set<ActivityId>();
  let mateTimer = range(14, 24), incTimer = range(20, 32);
  let napTime = 0, requestTime = 0, lookoutTime = 0, wifiTime = 0, darkTime = 0;
  let forceCover = 0;
  let releaseAfterCover = false;
  let bribeCooldown = 0;
  let comboTime = 0;
  let comboBonus = 0;
  let funPending = 0;
  let footstepTimer = 0;
  let warned = false;
  let quiet = false;
  let surprise = surpriseOf(state.watcher.kind);
  const setCover = (on: boolean) => {
    if (state.phase !== 'play') return;
    if (forceCover > 0) {
      releaseAfterCover = !on;
      if (!on) return;
    }
    if (state.cover === on) return;
    state.cover = on;
    events.push({ t: 'cover', on });
  };
  const strike = (reason: string) => {
    state.strikes++;
    state.sus = 40;
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
      w.kind = pickKind(); duration = awayTime(w.kind);
      w.hint = 0; w.near = 0; warned = false; quiet = false;
      surprise = surpriseOf(w.kind);
      events.push({ t: 'door', open: false });
    } else if (mode === 'approach') {
      duration = range(3, 5) / (0.85 + level * 0.15) * (w.kind === 'sneaky' ? 0.6 : 1); w.hint = 1; w.near = 0;
      footstepTimer = 0;
    } else if (mode === 'peek') {
      duration = range(1.5, 2.8); w.hint = 2; w.near = 0.2;
      events.push({ t: 'peek' });
    } else if (mode === 'scan') {
      duration = range(4, 7) / (0.9 + level * 0.1); w.hint = 2;
      events.push({ t: 'door', open: true }, { t: 'scan' });
    } else {
      duration = range(2, 3); w.hint = 1;
      events.push({ t: 'leave' });
    }
  };
  const score = () => Math.max(0, Math.round(state.fun * 10 + comboBonus + state.study * 3 - state.strikes * 150));
  const finish = () => {
    state.phase = 'done'; state.score = score();
    const quality = state.fun / state.goal * 80 + state.study * 0.2 + used.size * 1.5 - state.strikes * 10 - state.sus * 0.12;
    state.grade = state.fun < state.goal ? (state.fun >= state.goal * 0.6 ? 'C' : 'D')
      : quality + (level - 1) * 6 >= 114 ? 'S' : quality + (level - 1) * 6 >= 100 ? 'A' : quality + (level - 1) * 6 >= 86 ? 'B' : 'C';
    events.push({ t: 'done', grade: state.grade });
  };
  const active0 = () => (!state.cover ? state.activity : null);
  const toast = (text: string) => events.push({ t: 'toast', text });
  /** 짝꿍/룸메 돌발: 졸고 있음 / 부탁 / 망봐주기(우호도 높을 때) */
  const mateEvent = () => {
    const r = random();
    if (r < 0.3) { napTime = 8; toast(`${mate}가 꾸벅꾸벅 졸고 있어요. 지금이 기회! (경고는 못 줘요)`); }
    else if (r < 0.65 || state.friend < 40) {
      requestTime = 9; toast(`${mate}가 같이 메신저 하자고 눈짓해요.`);
    } else { lookoutTime = 14; toast(`${mate}가 대신 망을 봐줄게요!`); }
  };
  /** 랜덤 돌발(전부 toast): 교실=교탁 소리·안내 방송 / 기숙사=와이파이 끊김·정전 */
  const incident = () => {
    const a = active0(); const r = random();
    if (stage === 'class') {
      events.push({ t: 'quiet' });
      if (r < 0.5) {
        if (a === 'game') { state.sus = clamp(state.sus + 12); toast('교탁에서 쿵 소리! 게임 소리가 너무 컸어요!'); }
        else toast('교탁에서 쿵 소리가 났어요.');
      } else {
        toast(a ? '안내 방송이 울려서 깜짝 놀랐어요!' : '안내 방송이 울렸어요.');
        if (a) state.sus = clamp(state.sus + (a === 'game' ? 6 : 3));
      }
    } else if (r < 0.5) { wifiTime = 7; toast('와이파이가 끊겼어요! 온라인 딴짓이 시들해져요.'); }
    else { darkTime = 6; toast('정전! 사감도 어둠 속에서 헤매요.'); }
  };
  const tick = (dt: number) => {
    state.time = Math.min(state.limit, state.time + dt);
    forceCover = Math.max(0, forceCover - dt);
    bribeCooldown = Math.max(0, bribeCooldown - dt);
    const w = state.watcher;
    w.t += dt; w.prog = clamp(w.t / duration, 1);
    napTime = Math.max(0, napTime - dt); lookoutTime = Math.max(0, lookoutTime - dt);
    wifiTime = Math.max(0, wifiTime - dt); darkTime = Math.max(0, darkTime - dt);
    if (requestTime > 0 && (requestTime -= dt) <= 0) {
      state.friend = clamp(state.friend - 4);
      events.push({ t: 'toast', text: `${mate}의 부탁을 놓쳤어요. 조금 서운해해요.` });
    }
    if (w.mode === 'away') {
      mateTimer -= dt; incTimer -= dt;
      if (duration - w.t > 3.5 && w.t > 1) {
        if (!isClass && mateTimer <= 0) { mateTimer = range(20, 32); mateEvent(); }
        else if (incTimer <= 0) { incTimer = range(22, 36) / pace; incident(); }
      }
      const lead = lookoutTime > 0 ? 3.2 : 1.6;
      if (!isClass && !warned && duration - w.t <= lead) {
        warned = true;
        const lookout = lookoutTime > 0; lookoutTime = 0;
        const asleep = napTime > 0 || (active0() === 'music');
        if (!asleep && (lookout || random() < state.friend / 100 * 0.85)) events.push({ t: 'friend-warn' });
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
    if (state.phase !== 'play') return;
    if (state.cover) {
      state.study = clamp(state.study + 0.6 * dt);
      state.sus = clamp(state.sus - 1.1 * dt);
      comboTime = 0; state.combo = 1;
    } else if (active) {
      comboTime += dt;
      state.combo = Math.min(5, 1 + Math.floor(comboTime / 12));
      // 같은 활동을 오래 하면 질리고, 다른 활동으로 바꾸면 잠깐 신선함 보너스
      streak += dt; novelty = Math.max(0, novelty - dt);
      if (streak > 18 && !boredToast) { boredToast = true; toast('같은 딴짓만 하니 슬슬 질려요. 다른 걸 해볼까요?'); }
      const bored = Math.max(0.4, 1 - Math.max(0, streak - 10) / 35);
      const mood = bored * (novelty > 0 ? 1.35 : 1) * (wifiTime > 0 && online.includes(active) ? 0.3 : 1) * (darkTime > 0 ? 0.5 : 1);
      const sm = (napTime > 0 ? 0.7 : 1) * (darkTime > 0 ? 0.5 : 1) * V[active];
      const gain = Math.min(100 - state.fun, R[active][0] * (1 + (state.combo - 1) * 0.15) * mood * RATE * dt);
      state.fun = clamp(state.fun + gain); funPending += gain; comboBonus += gain * (state.combo - 1) * 2;
      state.sus = clamp(state.sus + R[active][1] * sm * dt);
      if (requestTime > 0 && active === requestAct) {
        requestTime = 0; state.friend = clamp(state.friend + 12); state.fun = clamp(state.fun + 4); funPending += 4;
        toast(`${mate}와 호흡이 척척! 사이가 더 좋아졌어요.`);
      }
      if (w.mode === 'approach') state.sus = clamp(state.sus + (N[active] ?? 0) * (0.5 + w.prog) * 4 * sm * dt);
      if (funPending >= 3) { events.push({ t: 'fun', amount: funPending, activity: active }); funPending = 0; }
      if (!isClass && batteryActivities.includes(active)) { // 학교 노트북은 배터리가 없다
        state.battery = clamp(state.battery - (active === 'music' ? 0.12 : 0.8) * dt);
        if (state.battery === 0) {
          state.activity = null; events.push({ t: 'activity', id: null }, { t: 'toast', text: '배터리가 다 떨어졌어요.' });
        }
      }
      if (w.mode === 'peek') state.sus = clamp(state.sus + 36 * sm * dt);
      if (w.mode === 'scan') {
        state.sus = clamp(state.sus + (25 + 75 * w.near) * sm * dt);
      }
      if (state.phase === 'play' && state.sus >= 100) strike(why[active]);
    }
    state.score = score();
    if (state.phase === 'play' && state.time >= state.limit - 1e-8) { state.time = state.limit; finish(); }
    if (forceCover === 0 && releaseAfterCover) { releaseAfterCover = false; setCover(false); }
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
      if (!isClass && id !== null && batteryActivities.includes(id) && state.battery <= 0) return;
      if (state.activity === id) return;
      if (id !== null && id !== lastAct) {
        if (lastAct !== null && streak >= 5) novelty = 4; // 5초 이상 한 뒤 바꿨을 때만(연타 방지)
        streak = 0; boredToast = false; lastAct = id; used.add(id);
      }
      state.activity = id; events.push({ t: 'activity', id });
    },
    bribe() {
      if (isClass || state.phase !== 'play' || bribeCooldown > 0) return false;
      state.friend = clamp(state.friend + 15); bribeCooldown = 8; return true;
    },
    drain() { const result = events; events = []; return result; },
  };
};

