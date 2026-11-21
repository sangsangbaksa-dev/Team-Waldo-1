// FRONTLINE — 실시간 전략 모드 진입점: 시작 화면, 입력, HUD, 게임 루프, 1대1 연결.
import './rts.css';
import '../shared/ui.css';
import { readPreferences, writePreferences } from '../prefs';
import { readRtsRecords, writeRtsRecords } from '../records';
import type { LoadingScreen } from '../loading';
import type { PvpSession } from '../net/lobby';
import { RtsAi } from './ai';
import { Campaign, MISSIONS, readCampaign, recordResult, unlocked, writeCampaign, type CampaignSave } from './campaign';
import { Vision, FOG_HIDDEN, FOG_VISIBLE } from './vision';
import { RtsAudio } from './audio';
import { ABILITIES, ABILITY_KEYS, BUILDINGS, DIFFICULTIES, LEVELS, RESEARCH, RESEARCH_KINDS, STIM_COST, SUPPLY_MAX, TICK, UNITS, isDifficulty, type BuildKind, type Difficulty, type UnitKind } from './config';
import { RtsNet } from './pvp';
import { RtsSim, type Building, type Cmd, type ResNode, type Unit } from './sim';
import { RtsView } from './view';
import { buildLanes } from './scenery';
import { preloadUnitKit } from './models';
import { PVP_ENABLED } from '../net/config';
import type { RoomLink } from './moba/net';

const esc = (s: string): string => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
const clock = (ticks: number): string => { const s = Math.floor(ticks / TICK); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const BUILD_MENU: BuildKind[] = ['depot', 'barracks', 'factory', 'tower', 'hq'];
const ABILITY_ORDER = (['marine', 'rocket', 'tank', 'jeep', 'medic'] as UnitKind[]).filter(k => ABILITIES[k]);
const FOG_KEY = 'waldo.rts.fog';
const readFog = (): boolean => { try { return localStorage.getItem(FOG_KEY) !== '0'; } catch { return true; } };
const writeFog = (on: boolean): void => { try { localStorage.setItem(FOG_KEY, on ? '1' : '0'); } catch { /* 저장 불가 환경 */ } };

interface Btn { label: string; sub?: string; key: string; on: () => void; enabled?: boolean; hint?: string; active?: boolean }
type Mode = null | { t: 'attack' } | { t: 'move' } | { t: 'rally' } | { t: 'build'; kind: BuildKind };

export function openRts(onExit: () => void, options: { loading?: LoadingScreen } = {}): void {
  const prefs = readPreferences(), touch = matchMedia('(pointer: coarse)').matches;
  const root = document.createElement('div'); root.className = 'rt-root' + (touch ? ' touch' : ''); root.dataset.phase = 'setup';
  root.innerHTML = `<canvas class="rt-canvas"></canvas><canvas class="rt-over"></canvas>
    <div class="rt-top"><div class="rt-res"><span class="rt-min" title="광물"><i></i><b id="rt-min">0</b><small id="rt-rate"></small></span><span class="rt-sup" title="인구"><b id="rt-sup">0/0</b></span><span class="rt-time" id="rt-time">0:00</span></div>
      <div class="rt-vs" id="rt-vs"></div>
      <div class="rt-btns"><button data-act="speed" title="속도" hidden>×1</button><button data-act="pause" class="rt-pause" title="일시정지 (P)">⏸ 일시정지</button><button data-act="mute" title="소리" aria-pressed="${prefs.sound}">${prefs.sound ? '🔊' : '🔇'}</button><button data-act="menu" title="메뉴 (Esc)">☰</button></div></div>
    <div class="rt-obj" id="rt-obj" aria-live="polite"></div><div class="rt-banner" id="rt-banner" role="status" aria-live="assertive"></div>
    <div class="rt-toast" id="rt-toast" role="status" aria-live="polite"></div><div class="rt-hint" id="rt-hint"></div><div class="rt-shortcuts">. 놀고 있는 일꾼 <span>·</span> F2 대기 병력 <span>·</span> Space 최근 경고</div>
    <div class="rt-bottom"><div class="rt-mini"><canvas id="rt-mini" width="220" height="220" aria-label="미니맵"></canvas></div><div class="rt-sel" id="rt-sel"></div><div class="rt-cmd" id="rt-cmd"></div></div>
    <div class="rt-modal" id="rt-modal"></div>`;
  document.body.append(root);
  const $ = <T extends HTMLElement>(s: string): T => root.querySelector<T>(s)!;
  let canvas = $<HTMLCanvasElement>('.rt-canvas'); const over = $<HTMLCanvasElement>('.rt-over'), og = over.getContext('2d')!, mini = $<HTMLCanvasElement>('#rt-mini'), mg = mini.getContext('2d')!, modal = $('#rt-modal');
  const audio = new RtsAudio(); audio.enabled = prefs.sound;

  let sim: RtsSim | null = null, view: RtsView | null = null, ai: RtsAi | null = null, net: RtsNet | null = null, pvp: { s: PvpSession; done: boolean } | null = null;
  let me = 0, difficulty: Difficulty = (() => { const d = readRtsRecords().difficulty; return isDifficulty(d) ? d : 'normal'; })();
  let raf = 0, last = 0, acc = 0, paused = false, closed = false, ended = false, speed = 1, uiT = 0, miniT = 0, hudKey = '', cmdKey = '', selKey = '', alertAt = { x: 0, y: 0, t: -999 };
  let camp: Campaign | null = null, vision: Vision | null = null, fogOn = readFog(), campSave: CampaignSave = readCampaign(), objKey = '', fogVer = -1, bannerT = 0;
  const selected = new Set<number>(), groups = new Map<number, number[]>(); let mode: Mode = null, submenu = false, buttons: Btn[] = [];
  const pointer = { x: 0, y: 0, in: false, down: false, sx: 0, sy: 0, drag: false, button: 0, pan: false, lastTap: 0, lastTapId: 0 };
  const touches = new Map<number, { x: number; y: number }>(); let pinch = 0, boxMode = false; const keys = new Set<string>();
  const stats = { start: 0 };

  // ---------- 알림 ----------
  let toastT = 0; const toast = (text: string, bad = false): void => { const el = $('#rt-toast'); el.textContent = text; el.className = `rt-toast show${bad ? ' bad' : ''}`; toastT = 2.2; if (bad) audio.sfx('error'); };
  const setHint = (t: string): void => { $('#rt-hint').textContent = t; $('#rt-hint').classList.toggle('show', !!t); };
  /** 화면 가운데 위에 크게 잠깐 보이는 안내(목표 달성·적 공세 경고). */
  const banner = (text: string, kind: 'ok' | 'warn' | 'bonus' | 'info' = 'info'): void => { const el = $('#rt-banner'); el.textContent = text; el.className = `rt-banner show ${kind}`; bannerT = 3.4; };

  // ---------- 선택 보조 ----------
  const own = (): { us: Unit[]; bs: Building[] } => {
    const us: Unit[] = [], bs: Building[] = []; if (!sim) return { us, bs };
    for (const id of selected) { const u = sim.unit(id); if (u && u.owner === me) us.push(u); else { const b = sim.building(id); if (b && b.owner === me) bs.push(b); } }
    return { us, bs };
  };
  const setSel = (ids: number[]): void => { selected.clear(); ids.forEach(i => selected.add(i)); submenu = false; if (mode?.t !== 'build') mode = null; refresh(); };
  const refresh = (): void => { cmdKey = ''; selKey = ''; paintCommands(); paintSelection(true); };
  const issue = (c: Cmd): void => { if (!sim || ended) return; if (net) net.send(c); else sim.apply(me, c); };

  // ---------- 명령 ----------
  const ping = (x: number, y: number, c: number): void => view?.ping(x, y, c);
  function orderMove(x: number, y: number, attack: boolean): void {
    const { us } = own(); if (!us.length) return;
    issue({ k: attack ? 'amove' : 'move', ids: us.map(u => u.id), x, y }); ping(x, y, attack ? 0xff6b5a : 0x5dff9a); audio.sfx('order');
  }
  function rightClick(sx: number, sy: number): void {
    if (!sim || !view) return; const id = view.pick(sx, sy), e = id ? sim.index.get(id) : undefined, g = view.ground(sx, sy), { us, bs } = own();
    if (us.length) {
      if (e && e.k !== 'node' && e.owner !== me) {
        const ids = us.filter(u => UNITS[u.kind].dmg > 0 && (u.kind !== 'worker' || us.every(x => x.kind === 'worker'))).map(u => u.id); if (ids.length) { issue({ k: 'attack', ids, target: e.id }); const c = sim.center(e); ping(c.x, c.y, 0xff6b5a); audio.sfx('order'); return; }
      } else if (e?.k === 'node') {
        const ws = us.filter(u => u.kind === 'worker').map(u => u.id), rest = us.filter(u => u.kind !== 'worker').map(u => u.id);
        if (ws.length) issue({ k: 'gather', ids: ws, node: e.id }); if (rest.length) issue({ k: 'move', ids: rest, x: e.x + 0.5, y: e.y + 0.5 }); ping(e.x + 0.5, e.y + 0.5, 0x6fe0ff); audio.sfx('order'); return;
      } else if (e?.k === 'building' && e.owner === me && !e.done && us.some(u => u.kind === 'worker')) {
        issue({ k: 'resume', ids: us.filter(u => u.kind === 'worker').map(u => u.id), b: e.id }); audio.sfx('order'); return;
      }
      if (g) orderMove(g.x, g.y, false); return;
    }
    const prod = bs.filter(b => b.done && BUILDINGS[b.kind].trains.length);
    if (prod.length && g) { for (const b of prod) issue({ k: 'rally', b: b.id, x: g.x, y: g.y, node: e?.k === 'node' && b.kind === 'hq' ? e.id : 0 }); ping(g.x, g.y, 0x5dff9a); audio.sfx('order'); }
  }
  function leftClickMode(sx: number, sy: number): boolean {
    if (!mode || !view || !sim) return false; const g = view.ground(sx, sy); if (!g) return true;
    if (mode.t === 'attack') { orderMove(g.x, g.y, true); mode = null; setHint(''); }
    else if (mode.t === 'move') { orderMove(g.x, g.y, false); mode = null; setHint(''); }
    else if (mode.t === 'rally') { const { bs } = own(); for (const b of bs) if (BUILDINGS[b.kind].trains.length) issue({ k: 'rally', b: b.id, x: g.x, y: g.y, node: 0 }); ping(g.x, g.y, 0x5dff9a); audio.sfx('order'); mode = null; setHint(''); }
    else tryPlace(g.x, g.y);
    return true;
  }
  function ghostAt(x: number, y: number, kind: BuildKind): { x: number; y: number } { const s = BUILDINGS[kind].size; return { x: Math.round(x - s / 2), y: Math.round(y - s / 2) }; }
  function tryPlace(gx: number, gy: number): void {
    if (!sim || mode?.t !== 'build') return; const kind = mode.kind, at = ghostAt(gx, gy, kind);
    if (!placeAt(kind, at.x, at.y)) return;
    if (!keys.has('Shift')) { mode = null; setHint(''); }
  }
  /** 선택한 일꾼(없으면 가장 알맞은 일꾼)에게 건설을 맡깁니다. 지으면 true. */
  function placeAt(kind: BuildKind, x: number, y: number): boolean {
    if (!sim) return false; const d = BUILDINGS[kind], at = { x, y }, { us } = own(); let ws = us.filter(u => u.kind === 'worker');
    if (!ws.length) ws = sim.units.filter(u => u.owner === me && u.kind === 'worker');
    if (!ws.length) { toast('일꾼이 없습니다', true); mode = null; return false; }
    if (!sim.canPlace(kind, at.x, at.y)) { toast('여기에는 지을 수 없습니다 (붉은 자리는 막힌 곳)', true); return false; }
    if (sim.players[me].minerals < d.cost) { toast('광물이 부족합니다', true); return false; }
    // 쉬거나 캐는 일꾼을 우선하고, 건설 중이거나 광물을 든 일꾼은 뒤로 미룹니다.
    let w = ws[0], bd = Infinity; for (const u of ws) { const dd = sim.dist(u.x, u.y, at.x, at.y) + (u.o.t === 'build' ? 1000 : 0) + (u.carry > 0 ? 12 : 0); if (dd < bd) { bd = dd; w = u; } }
    issue({ k: 'build', id: w.id, b: kind, x: at.x, y: at.y, q: keys.has('Shift') }); audio.sfx('place'); ping(at.x + d.size / 2, at.y + d.size / 2, 0x5dff9a);
    return true;
  }
  /** 카메라가 보는 곳 가까이에 알아서 자리를 잡아 짓습니다. */
  function autoPlace(kind: BuildKind): void {
    if (!sim || !view) return; const cx = view.cam.x, cy = view.cam.y, hq = sim.buildings.find(b => b.owner === me && b.kind === 'hq' && b.done);
    const far = !!hq && Math.hypot(hq.x - cx, hq.y - cy) > 40, ax = far ? hq!.x + 2 : cx, ay = far ? hq!.y + 2 : cy;
    const site = sim.findSite(kind, ax, ay, kind === 'hq' ? 0 : 9); if (!site) { toast('근처에 지을 자리가 없습니다', true); return; }
    if (placeAt(kind, site.x, site.y) && !keys.has('Shift')) { mode = null; setHint(''); }
  }

  // ---------- 명령 카드 ----------
  function buildButtons(): Btn[] {
    if (!sim || ended) return [];
    const { us, bs } = own(), p = sim.players[me], out: Btn[] = [];
    const startMode = (m: NonNullable<Mode>, hint: string): void => { mode = m; setHint(hint); submenu = false; };
    const hasWorker = sim.units.some(u => u.owner === me && u.kind === 'worker');
    const buildBtn: Btn = { label: '건설', key: 'B', on: () => { submenu = true; mode = null; setHint(''); } };
    const buildMenu = (): Btn[] => {
      const o: Btn[] = [];
      for (const k of BUILD_MENU) { const d = BUILDINGS[k], lack = d.req && !sim!.has(me, d.req) ? `${BUILDINGS[d.req].name} 필요` : p.minerals < d.cost ? '광물 부족' : ''; o.push({ label: d.name, sub: `◆${d.cost}`, key: d.key, enabled: !lack, hint: lack || d.role, on: () => startMode({ t: 'build', kind: k }, `${d.name}: 지을 곳을 클릭 · Enter 자동 배치 · Shift 연속 건설 · 우클릭 취소`) }); }
      o.push({ label: '뒤로', key: 'ESCAPE', on: () => { submenu = false; } }); return o;
    };
    if (mode?.t === 'build') { const k = mode.kind; return [{ label: '자동 배치', sub: '알아서 지음', key: 'ENTER', on: () => autoPlace(k) }, { label: '취소', key: 'ESCAPE', on: () => { mode = null; setHint(''); } }]; }
    if (submenu && hasWorker) return buildMenu();
    if (!us.length && !bs.length) { if (hasWorker) out.push(buildBtn); return out; }
    if (us.length) {
      out.push({ label: '이동', key: 'M', on: () => startMode({ t: 'move' }, '이동할 곳을 클릭하세요'), active: mode?.t === 'move' });
      out.push({ label: '정지', key: 'S', on: () => { issue({ k: 'stop', ids: us.map(u => u.id) }); audio.sfx('order'); } });
      out.push({ label: '공격 이동', key: 'A', on: () => startMode({ t: 'attack' }, '공격 이동할 곳을 클릭하세요'), active: mode?.t === 'attack' });
      ABILITY_ORDER.filter(k => us.some(u => u.kind === k)).slice(0, ABILITY_KEYS.length).forEach((k, i) => {
        const a = ABILITIES[k]!, group = us.filter(u => u.kind === k), ready = group.filter(u => u.abcd <= sim!.tick && (k !== 'marine' || u.hp > STIM_COST + 1)), wait = Math.min(...group.map(u => Math.max(0, u.abcd - sim!.tick)));
        const on = group.some(u => u.ab > sim!.tick && k !== 'medic');
        out.push({ label: a.name, sub: on ? '발동 중' : ready.length ? (group.length > 1 ? `${ready.length}기 준비` : '준비') : wait > 0 ? `${Math.ceil(wait / TICK)}초` : '체력 부족', key: ABILITY_KEYS[i], enabled: ready.length > 0, active: on,
          hint: ready.length ? a.desc : wait > 0 ? `재사용 대기 중 (${Math.ceil(wait / TICK)}초)` : '체력이 너무 낮아 쓸 수 없습니다', on: () => { issue({ k: 'ability', ids: ready.map(u => u.id) }); } });
      });
      if (us.some(u => u.kind === 'worker')) out.push(buildBtn);
      return out;
    }
    if (bs.length) {
      const b = bs[0];
      if (!b.done) {
        out.push({ label: '건설 이어서', sub: '일꾼 보내기', key: 'C', on: () => { const w = sim!.spareWorker(b); if (!w) { toast('보낼 일꾼이 없습니다', true); return; } issue({ k: 'resume', ids: [w.id], b: b.id }); audio.sfx('order'); toast('일꾼을 보냈습니다'); } });
        out.push({ label: '건설 취소', sub: `◆${Math.floor(BUILDINGS[b.kind].cost * 0.75)} 환급`, key: 'X', on: () => issue({ k: 'cancel', b: b.id, i: -1 }) }); return out;
      }
      for (const u of BUILDINGS[b.kind].trains) {
        const d = UNITS[u], lack = !sim.canTrain(me, u) ? `${BUILDINGS[d.req!].name} 필요` : p.minerals < d.cost ? '광물 부족' : p.cap - p.used < d.supply ? '보급소 필요' : b.queue.length >= 5 ? '대기열 가득' : '';
        out.push({ label: d.name, sub: `◆${d.cost} · 인구 ${d.supply}`, key: d.key, enabled: !lack, hint: lack || d.role, on: () => { for (const x of bs.filter(y => y.kind === b.kind && y.done)) { if (sim && sim.players[me].minerals >= d.cost && x.queue.length < 5) { issue({ k: 'train', b: x.id, u }); if (!keys.has('Shift')) break; } } audio.sfx('click'); } });
      }
      for (const r of RESEARCH_KINDS.filter(k => RESEARCH[k].from === b.kind)) {
        const d = RESEARCH[r], busy = sim.buildings.some(x => x.owner === me && x.research?.r === r), lack = p.up[r] ? '연구 완료' : busy ? '연구 중' : b.research ? '이 건물은 연구 중' : p.minerals < d.cost ? '광물 부족' : '';
        out.push({ label: d.name, sub: p.up[r] ? '완료' : `◆${d.cost}`, key: d.key, enabled: !lack, hint: lack || d.role, on: () => issue({ k: 'research', b: b.id, r }) });
      }
      if (hasWorker && b.kind === 'hq') out.push(buildBtn);
      if (BUILDINGS[b.kind].trains.length) out.push({ label: '집결지', key: 'R', on: () => startMode({ t: 'rally' }, '집결지를 클릭하세요(광물을 누르면 일꾼이 바로 캡니다)'), active: mode?.t === 'rally' });
    }
    return out;
  }
  function paintCommands(): void {
    buttons = buildButtons(); const el = $('#rt-cmd');
    const key = buttons.map(b => `${b.label}|${b.sub}|${b.enabled}|${b.active}`).join(';') + (touch ? `|${boxMode}` : ''); if (key === cmdKey) return; cmdKey = key;
    el.innerHTML = buttons.map((b, i) => `<button type="button" data-i="${i}" class="${b.active ? 'on' : ''}" ${b.enabled === false ? 'aria-disabled="true"' : ''} title="${esc(b.hint ?? '')}"><b>${esc(b.label)}</b>${b.sub ? `<small>${esc(b.sub)}</small>` : ''}<kbd>${b.key === 'ESCAPE' ? 'Esc' : esc(b.key)}</kbd></button>`).join('') +
      (touch ? `<button type="button" data-box class="${boxMode ? 'on' : ''}"><b>범위 선택</b><small>${boxMode ? '켜짐' : '꺼짐'}</small></button><button type="button" data-quick="army"><b>전체 병력</b><small>일꾼 제외</small></button><button type="button" data-quick="idle"><b>놀고 있는 일꾼</b></button>` : '');
  }
  $('#rt-cmd').addEventListener('click', e => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('button'); if (!t) return;
    if (t.dataset.box !== undefined) { boxMode = !boxMode; cmdKey = ''; return; }
    if (t.dataset.quick && sim) {
      if (t.dataset.quick === 'army') { const a = sim.units.filter(u => u.owner === me && u.kind !== 'worker' && u.hp > 0); if (a.length) { setSel(a.map(u => u.id)); view?.lookAt(a[0].x, a[0].y); } else toast('병력이 없습니다'); }
      else { const w = sim.units.filter(u => u.owner === me && u.kind === 'worker' && u.o.t === 'idle'); if (w.length) { const i = Math.max(0, w.findIndex(u => selected.has(u.id)) + 1) % w.length; setSel([w[i].id]); view?.lookAt(w[i].x, w[i].y); } else toast('놀고 있는 일꾼이 없습니다'); }
      cmdKey = ''; return;
    }
    const b = buttons[Number(t.dataset.i)]; if (!b) return; if (b.enabled === false) { toast(b.hint ?? '지금은 할 수 없습니다', true); return; } b.on(); cmdKey = ''; selKey = '';
  });

  // ---------- 선택 패널 ----------
  function paintSelection(force = false): void {
    if (!sim) return; const el = $('#rt-sel'), ents = [...selected].map(id => sim!.index.get(id)).filter((e): e is Unit | Building | ResNode => !!e);
    const key = ents.map(e => e.k === 'unit' ? `${e.id}:${e.hp}:${e.ab > sim!.tick ? 1 : 0}:${Math.ceil(Math.max(0, e.abcd - sim!.tick) / TICK)}` : e.k === 'building' ? `${e.id}:${e.hp}:${e.queue.length}:${e.queue[0]?.left ?? 0}:${e.done}:${e.progress >> 4}:${e.research ? e.research.left >> 3 : -1}` : `${e.id}:${e.amount}`).join(',');
    if (!force && key === selKey) return; selKey = key;
    if (!ents.length) { el.innerHTML = '<p class="rt-tip">유닛이나 건물을 선택하세요.<br>드래그로 여러 유닛을 한꺼번에 선택할 수 있습니다.</p>'; return; }
    const bar = (v: number, max: number, c = ''): string => `<span class="rt-bar ${c}"><i style="width:${Math.max(0, Math.min(100, v / max * 100)).toFixed(0)}%"></i></span>`;
    if (ents.length === 1) {
      const e = ents[0];
      if (e.k === 'unit') {
        const d = UNITS[e.kind], action = d.heal ? `치료 ${d.heal}/초` : d.repair ? `수리 ${d.repair}/초` : `공격 ${d.dmg}`, max = camp?.maxHp(e) ?? d.hp, ab = ABILITIES[e.kind], vip = camp?.isVip(e.id);
        const abLine = ab && e.owner === me ? `<p class="rt-num">${ab.name} · ${e.ab > sim.tick && e.kind !== 'medic' ? '발동 중' : e.abcd <= sim.tick ? '준비 완료' : `${Math.ceil((e.abcd - sim.tick) / TICK)}초 뒤`}</p>` : '';
        el.innerHTML = `<div class="rt-one"><h3>${vip ? '호송 전차' : d.name}<small>${e.owner === me ? '' : ' · 적'}</small></h3><p>${vip ? '목적지까지 호위하세요' : d.role}</p>${bar(e.hp, max, e.owner === me ? '' : 'foe')}<p class="rt-num">체력 ${Math.ceil(e.hp)} / ${max}</p><p class="rt-num">${action} · 사거리 ${d.range} · 이동 ${d.speed}</p>${abLine}</div>`;
      }
      else if (e.k === 'building') {
        const d = BUILDINGS[e.kind], rs = e.research ? `<button type="button" class="rt-q" data-r="1" title="연구 취소하고 환급"><b>${RESEARCH[e.research.r].name}</b>${bar(RESEARCH[e.research.r].time - e.research.left, RESEARCH[e.research.r].time, 'prog')}</button>` : '', q = rs + e.queue.map((x, i) => `<button type="button" class="rt-q" data-q="${i}" title="취소하고 환급"><b>${UNITS[x.u].name}</b>${i === 0 ? bar(UNITS[x.u].time - x.left, UNITS[x.u].time, 'prog') : ''}</button>`).join('');
        el.innerHTML = `<div class="rt-one"><h3>${d.name}<small>${e.owner === me ? '' : ' · 적'}</small></h3><p>${e.done ? d.role : `건설 중 ${Math.floor(e.progress / d.time * 100)}%`}</p>${bar(e.hp, e.maxhp, e.owner === me ? '' : 'foe')}<p class="rt-num">체력 ${Math.ceil(e.hp)} / ${e.maxhp}${e.kind === 'tower' ? ` · 공격 ${d.dmg} · 사거리 ${d.range}` : ''}</p>${q ? `<div class="rt-queue">${q}</div>` : ''}</div>`;
      } else el.innerHTML = `<div class="rt-one"><h3>광물</h3><p>일꾼으로 채취하세요</p><p class="rt-num">남은 양 ${e.amount}</p></div>`;
      return;
    }
    const units = ents.filter((e): e is Unit => e.k === 'unit'), shown = units.slice(0, 24);
    el.innerHTML = `<div class="rt-multi">${shown.map(u => `<button type="button" data-id="${u.id}" title="${UNITS[u.kind].name}" class="${u.owner === me ? '' : 'foe'}"><b>${UNITS[u.kind].name.slice(0, 2)}</b>${bar(u.hp, UNITS[u.kind].hp)}</button>`).join('')}${units.length > shown.length ? `<span class="rt-more">+${units.length - shown.length}</span>` : ''}</div>`;
  }
  $('#rt-sel').addEventListener('click', e => {
    const t = e.target as HTMLElement, rq = t.closest<HTMLElement>('[data-r]'), q = t.closest<HTMLElement>('[data-q]'), c = t.closest<HTMLElement>('[data-id]');
    if (rq) { const { bs } = own(); if (bs[0]) issue({ k: 'cancel', b: bs[0].id, i: -2 }); } else if (q) { const { bs } = own(); if (bs[0]) issue({ k: 'cancel', b: bs[0].id, i: Number(q.dataset.q) }); } else if (c) { setSel([Number(c.dataset.id)]); selKey = ''; cmdKey = ''; }
  });

  // ---------- 미니맵 ----------
  let miniBase: HTMLCanvasElement | null = null;
  const mm = (x: number, y: number): [number, number] => { const n = sim!.map.size, k = mini.width / n; return me === 0 ? [x * k, y * k] : [(n - x) * k, (n - y) * k]; };
  const mmInv = (px: number, py: number): { x: number; y: number } => { const n = sim!.map.size, k = n / mini.width, x = px * k, y = py * k; return me === 0 ? { x, y } : { x: n - x, y: n - y }; };
  function drawMini(): void {
    if (!sim || !view) return; const n = sim.map.size, k = mini.width / n;
    if (!miniBase) {
      miniBase = document.createElement('canvas'); miniBase.width = miniBase.height = mini.width; const g = miniBase.getContext('2d')!;
      g.fillStyle = '#c9a76d'; g.fillRect(0, 0, mini.width, mini.width);
      // 길·강을 먼저 깔고, 막힌 칸(협곡 바위)을 그 위에 얹습니다.
      const lanes = buildLanes(sim.map), line = (pts: Array<{ x: number; y: number }>, w: number, c: string): void => { g.strokeStyle = c; g.lineWidth = w; g.lineJoin = g.lineCap = 'round'; g.beginPath(); pts.forEach((p, i) => { const [px, py] = mm(p.x, p.y); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.stroke(); };
      line(lanes.river, 5, '#4f9fb8'); for (const l of [lanes.top, lanes.mid, lanes.bot]) { line(l, 4, '#55565a'); line(l, 1, '#e8b81c'); }
      g.fillStyle = '#8a5a36'; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (sim.map.terrain[y * n + x]) { const [px, py] = mm(x, y); g.fillRect(me === 0 ? px : px - k, me === 0 ? py : py - k, k + 0.5, k + 0.5); }
      for (const st of sim.map.starts) { const [px, py] = mm(st.x + 2, st.y + 2); g.fillStyle = 'rgba(70,72,74,.55)'; g.beginPath(); g.arc(px, py, 8 * k, 0, 6.3); g.fill(); }
    }
    mg.drawImage(miniBase, 0, 0);
    const vis = vision, seenNode = (x: number, y: number): boolean => !vis || vis.explored(x, y);
    mg.fillStyle = '#2fc4ff'; for (const nd of sim.nodes) { if (!seenNode(nd.x + 0.5, nd.y + 0.5)) continue; const [x, y] = mm(nd.x + 0.5, nd.y + 0.5); mg.fillRect(x - 2, y - 2, 4, 4); }
    for (const b of sim.buildings) { if (b.owner !== me && !seenNode(b.x + b.size / 2, b.y + b.size / 2)) continue; const [x, y] = mm(b.x + b.size / 2, b.y + b.size / 2), s = b.size * k; mg.fillStyle = b.owner === 0 ? '#3d8bff' : '#ff5a3c'; mg.fillRect(x - s / 2, y - s / 2, s, s); }
    for (const u of sim.units) { if (u.owner !== me && vis && !vis.visible(u.x, u.y)) continue; const [x, y] = mm(u.x, u.y); mg.fillStyle = camp?.isVip(u.id) ? '#ffe066' : u.owner === 0 ? '#9fd0ff' : '#ffb09f'; const r = camp?.isVip(u.id) ? 3.5 : 1.5; mg.fillRect(x - r, y - r, r * 2, r * 2); }
    if (vis) drawMiniFog(vis);
    if (camp) for (const m of camp.markerList()) {
      const [x, y] = mm(m.x, m.y), col = m.kind === 'goal' ? '#7dff9e' : m.side === 1 ? '#5db4ff' : m.side === 0 ? '#ff5a3c' : '#ffe27a'; mg.strokeStyle = col; mg.lineWidth = 2;
      if (m.kind === 'target') { mg.strokeRect(x - 5, y - 5, 10, 10); } else { mg.beginPath(); mg.arc(x, y, Math.max(4, m.r * k), 0, Math.PI * 2); mg.stroke(); if (m.progress > 0) { mg.fillStyle = col; mg.globalAlpha = 0.35; mg.beginPath(); mg.arc(x, y, Math.max(3, m.r * k * m.progress), 0, Math.PI * 2); mg.fill(); mg.globalAlpha = 1; } }
    }
    const cs = view.corners(over.clientHeight - $('.rt-bottom').offsetHeight);
    if (cs.length > 2) { mg.strokeStyle = '#fff'; mg.lineWidth = 1.5; mg.beginPath(); cs.forEach((c, i) => { const [x, y] = mm(Math.min(n, Math.max(0, c.x)), Math.min(n, Math.max(0, c.y))); if (i) mg.lineTo(x, y); else mg.moveTo(x, y); }); mg.closePath(); mg.stroke(); }
    if (sim.tick >= alertAt.t && sim.tick - alertAt.t < 100) { const [x, y] = mm(alertAt.x, alertAt.y), pulse = (performance.now() % 800) / 800; mg.strokeStyle = `rgba(255,75,55,${1 - pulse * 0.7})`; mg.lineWidth = 3; mg.beginPath(); mg.arc(x, y, 5 + pulse * 12, 0, Math.PI * 2); mg.stroke(); }
  }
  /** 미니맵 안개: 칸마다 투명도를 정해 한 장의 작은 그림으로 그린 뒤 늘려 덮습니다. */
  let fogMini: HTMLCanvasElement | null = null;
  function drawMiniFog(v: Vision): void {
    const n = v.n; if (!fogMini) { fogMini = document.createElement('canvas'); fogMini.width = fogMini.height = n; fogVer = -1; }
    if (fogVer !== v.version) {
      fogVer = v.version; const g = fogMini.getContext('2d')!, img = g.createImageData(n, n);
      for (let i = 0; i < n * n; i++) { const s = v.state[i]; img.data[i * 4] = 6; img.data[i * 4 + 1] = 10; img.data[i * 4 + 2] = 18; img.data[i * 4 + 3] = s === FOG_HIDDEN ? 215 : s === FOG_VISIBLE ? 0 : 105; }
      g.putImageData(img, 0, 0);
    }
    mg.save(); mg.imageSmoothingEnabled = true; if (me === 1) { mg.translate(mini.width, mini.width); mg.rotate(Math.PI); } mg.drawImage(fogMini, 0, 0, mini.width, mini.width); mg.restore();
  }
  let miniDown = false;
  const miniMove = (e: PointerEvent): void => { if (!view || !sim) return; const r = mini.getBoundingClientRect(), p = mmInv((e.clientX - r.left) / r.width * mini.width, (e.clientY - r.top) / r.height * mini.height); view.lookAt(p.x, p.y); };
  mini.addEventListener('pointerdown', e => {
    e.preventDefault(); if (!sim) return; mini.setPointerCapture(e.pointerId);
    if (e.button === 2) { const r = mini.getBoundingClientRect(), p = mmInv((e.clientX - r.left) / r.width * mini.width, (e.clientY - r.top) / r.height * mini.height); orderMove(p.x, p.y, false); return; }
    miniDown = true; miniMove(e);
  });
  mini.addEventListener('pointermove', e => { if (miniDown) miniMove(e); }); mini.addEventListener('pointerup', () => { miniDown = false; }); mini.addEventListener('contextmenu', e => e.preventDefault());

  // ---------- 오버레이(체력 막대·선택 상자) ----------
  function drawOverlay(): void {
    if (!sim || !view) return; const w = over.clientWidth, h = over.clientHeight; og.clearRect(0, 0, over.width, over.height);
    const dpr = over.width / Math.max(1, w); og.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bar = (x: number, y: number, bw: number, f: number, c: string): void => { og.fillStyle = 'rgba(0,0,0,.9)'; og.fillRect(x - bw / 2 - 2, y - 2, bw + 4, 8); og.fillStyle = '#41483e'; og.fillRect(x - bw / 2, y, bw, 4); og.fillStyle = c; og.fillRect(x - bw / 2, y, bw * Math.max(0, Math.min(1, f)), 4); };
    const col = (f: number, foe: boolean): string => foe ? '#ff5a4a' : f > 0.6 ? '#5dff9a' : f > 0.3 ? '#ffd24a' : '#ff5a4a';
    for (const u of sim.units) {
      const sel = selected.has(u.id), d = UNITS[u.kind], max = camp?.maxHp(u) ?? d.hp, vip = !!camp?.isVip(u.id); if (!sel && !vip && u.hp >= max) continue; if (view.hiddenUnit(u)) continue; const p = view.project(u.x, u.y, 1.2); if (!p || p.x < -20 || p.y < -20 || p.x > w + 20 || p.y > h + 20) continue;
      bar(p.x, p.y, 18 + d.radius * 14 + (vip ? 14 : 0), u.hp / max, col(u.hp / max, u.owner !== me));
      if (vip) { og.fillStyle = '#ffe066'; og.beginPath(); og.moveTo(p.x, p.y - 8); og.lineTo(p.x - 6, p.y - 16); og.lineTo(p.x + 6, p.y - 16); og.closePath(); og.fill(); }
    }
    for (const b of sim.buildings) {
      if (view.hiddenBuilding(b)) continue;
      const sel = selected.has(b.id); if (!sel && b.hp >= b.maxhp && b.done) continue; const p = view.project(b.x + b.size / 2, b.y + b.size / 2, BUILDINGS[b.kind].size < 3 ? 2 : 3.3); if (!p) continue;
      bar(p.x, p.y, 30 + b.size * 10, b.hp / b.maxhp, col(b.hp / b.maxhp, b.owner !== me));
      if (!b.done) bar(p.x, p.y + 6, 30 + b.size * 10, b.progress / BUILDINGS[b.kind].time, '#6fb7ff');
      else if (b.queue[0] && b.owner === me) bar(p.x, p.y + 6, 30 + b.size * 10, 1 - b.queue[0].left / UNITS[b.queue[0].u].time, '#6fb7ff');
    }
    if (camp) drawMarkers(w, h);
    if (pointer.down && pointer.drag && pointer.button === 0 && !pointer.pan) { const x = Math.min(pointer.sx, pointer.x), y = Math.min(pointer.sy, pointer.y), bw = Math.abs(pointer.x - pointer.sx), bh = Math.abs(pointer.y - pointer.sy); og.fillStyle = 'rgba(123,224,160,.12)'; og.fillRect(x, y, bw, bh); og.strokeStyle = 'rgba(0,0,0,.7)'; og.lineWidth = 3; og.strokeRect(x, y, bw, bh); og.strokeStyle = '#a2efb7'; og.lineWidth = 1; og.strokeRect(x, y, bw, bh); }
  }

  /** 목표 표시 이름표. 화면 밖이면 가장자리에 화살표로 방향을 알려 줍니다. */
  function drawMarkers(w: number, h: number): void {
    if (!view || !camp) return; const bottom = $('.rt-bottom').offsetHeight, top = 52, usable = h - bottom, cx = w / 2, cy = top + (usable - top) / 2, pad = 30;
    og.font = '700 12px system-ui, sans-serif'; og.textAlign = 'center'; og.lineJoin = 'round';
    const txt = (t: string, x: number, y: number, c: string): void => { og.lineWidth = 3.5; og.strokeStyle = 'rgba(8,10,12,.85)'; og.strokeText(t, x, y); og.fillStyle = c; og.fillText(t, x, y); };
    for (const m of camp.markerList()) {
      const col = m.kind === 'goal' ? '#7dff9e' : m.side === 1 ? '#7cc4ff' : m.side === 0 ? '#ff7a62' : '#ffe27a', p = view.project(m.x, m.y, m.kind === 'target' ? 3.4 : 2.4); if (!p) continue;
      const label = m.kind === 'point' ? `${m.label}${m.side === 1 ? ' ✓' : m.progress > 0 ? ` ${Math.round(m.progress * 100)}%` : ''}` : m.label;
      if (p.x > pad && p.x < w - pad && p.y > top && p.y < usable - 8) { txt(label, p.x, p.y - 6, col); continue; }
      const dx = p.x - cx, dy = p.y - cy, sc = Math.min((cx - pad) / Math.abs(dx || 1e-6), (usable - top) / 2 / Math.abs(dy || 1e-6) * 0.92, 1e6), ax = cx + dx * Math.min(sc, 1), ay = cy + dy * Math.min(sc, 1), ang = Math.atan2(dy, dx);
      og.save(); og.translate(ax, ay); og.rotate(ang); og.fillStyle = col; og.globalAlpha = 0.9; og.beginPath(); og.moveTo(10, 0); og.lineTo(-7, -8); og.lineTo(-7, 8); og.closePath(); og.fill(); og.restore();
      txt(label, Math.min(w - 40, Math.max(40, ax)), ay + (ay < cy ? 22 : -14), col);
    }
  }

  // ---------- 입력 ----------
  const rectOf = (): DOMRect => over.getBoundingClientRect();
  const local = (e: PointerEvent): { x: number; y: number } => { const r = rectOf(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function boxSelect(x0: number, y0: number, x1: number, y1: number, add: boolean): void {
    if (!sim || !view) return; const lo = { x: Math.min(x0, x1), y: Math.min(y0, y1) }, hi = { x: Math.max(x0, x1), y: Math.max(y0, y1) }, ids: number[] = add ? [...selected] : [];
    for (const u of sim.units) if (u.owner === me) { const p = view.project(u.x, u.y, 0.5); if (p && p.x >= lo.x && p.x <= hi.x && p.y >= lo.y && p.y <= hi.y && !ids.includes(u.id)) ids.push(u.id); }
    if (ids.length) { setSel(ids); audio.sfx('select'); } else if (!add) setSel([]);
  }
  function clickSelect(sx: number, sy: number, add: boolean, dbl: boolean): void {
    if (!sim || !view) return; const id = view.pick(sx, sy);
    if (!id) { if (!add) setSel([]); return; }
    const e = sim.index.get(id); if (!e) return;
    if (dbl && e.k === 'unit' && e.owner === me && pointer.lastTapId === id) {
      const ids: number[] = []; for (const u of sim.units) if (u.owner === me && u.kind === e.kind) { const p = view.project(u.x, u.y, 0.5); if (p && p.x >= 0 && p.y >= 0 && p.x <= over.clientWidth && p.y <= over.clientHeight) ids.push(u.id); }
      setSel(ids); audio.sfx('select'); return;
    }
    if (add && e.k !== 'node' && e.owner === me && [...selected].every(s => sim!.unit(s))) { if (selected.has(id)) selected.delete(id); else selected.add(id); return; }
    setSel([id]); audio.sfx('select');
  }
  over.addEventListener('contextmenu', e => e.preventDefault());
  over.addEventListener('pointerdown', e => {
    audio.unlock(); if (!sim || !view || ended) return; const p = local(e); over.setPointerCapture(e.pointerId);
    pointer.x = p.x; pointer.y = p.y; pointer.in = true;
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, p); if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); pointer.down = false; return; }
      pointer.down = true; pointer.sx = p.x; pointer.sy = p.y; pointer.drag = false; pointer.button = 0; pointer.pan = !boxMode; return;
    }
    if (e.button === 1) { pointer.down = true; pointer.pan = true; pointer.sx = p.x; pointer.sy = p.y; pointer.button = 1; return; }
    if (e.button === 2) { if (mode) { mode = null; setHint(''); cmdKey = ''; } else rightClick(p.x, p.y); return; }
    pointer.down = true; pointer.sx = p.x; pointer.sy = p.y; pointer.drag = false; pointer.button = 0; pointer.pan = false;
    if (mode && leftClickMode(p.x, p.y)) { pointer.down = false; cmdKey = ''; }
  });
  over.addEventListener('pointermove', e => {
    const p = local(e); const px = pointer.x, py = pointer.y; pointer.x = p.x; pointer.y = p.y; pointer.in = true;
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, p);
      if (touches.size === 2) { const [a, b] = [...touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch > 0 && view) view.zoom(pinch / d); pinch = d; return; }
    }
    if (!pointer.down) return;
    if (!pointer.drag && Math.hypot(p.x - pointer.sx, p.y - pointer.sy) > 8) pointer.drag = true;
    if (pointer.pan && view && pointer.drag) { const k = view.cam.dist / over.clientHeight * 1.5; view.pan(-(p.x - px) * k * 0.9, -(p.y - py) * k * 1.2); }
  });
  const release = (e: PointerEvent): void => {
    const p = local(e); touches.delete(e.pointerId); if (touches.size < 2) pinch = 0;
    if (!pointer.down || !sim || !view) { pointer.down = false; return; } pointer.down = false;
    if (pointer.button === 1) return;
    if (e.pointerType === 'touch') {
      if (pointer.pan && pointer.drag) return;
      if (pointer.drag && !pointer.pan) { boxSelect(pointer.sx, pointer.sy, p.x, p.y, false); return; }
      tapAt(p.x, p.y); return;
    }
    if (pointer.drag) { boxSelect(pointer.sx, pointer.sy, p.x, p.y, keys.has('Shift')); return; }
    const now = performance.now(), id = view.pick(p.x, p.y); clickSelect(p.x, p.y, keys.has('Shift'), now - pointer.lastTap < 350); pointer.lastTap = now; pointer.lastTapId = id;
  };
  over.addEventListener('pointerup', release); over.addEventListener('pointercancel', release);
  over.addEventListener('pointerleave', () => { pointer.in = false; });
  over.addEventListener('wheel', e => { e.preventDefault(); view?.zoom(e.deltaY > 0 ? 1.1 : 0.91); }, { passive: false });
  /** 터치: 내 유닛을 누르면 선택, 땅·적·광물을 누르면 명령, 선택이 없으면 해제. */
  function tapAt(sx: number, sy: number): void {
    if (!sim || !view) return; const id = view.pick(sx, sy), e = id ? sim.index.get(id) : undefined, { us, bs } = own();
    if (mode) { leftClickMode(sx, sy); cmdKey = ''; return; }
    if (e && e.k !== 'node' && e.owner === me) { setSel([id]); audio.sfx('select'); return; }
    if (us.length || bs.some(b => BUILDINGS[b.kind].trains.length && b.done)) { rightClick(sx, sy); return; }
    setSel(e ? [id] : []);
  }

  const hot = new Map<string, number>();
  function onKey(e: KeyboardEvent): void {
    if (modal.classList.contains('show') && e.key !== 'Escape' && !(root.dataset.phase === 'paused' && e.key.toLowerCase() === 'p')) return;
    if (e.type === 'keyup') { keys.delete(e.key === 'Shift' ? 'Shift' : e.code); return; }
    keys.add(e.key === 'Shift' ? 'Shift' : e.code); audio.unlock();
    const k = e.key.toUpperCase();
    if (root.dataset.phase === 'paused' && (e.key === 'Escape' || e.key.toLowerCase() === 'p')) { e.preventDefault(); hide(); paused = false; root.dataset.phase = 'play'; last = performance.now(); return; }
    if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey && sim && !ended) { e.preventDefault(); if (net) toast('온라인 대전은 일시정지할 수 없습니다', true); else openMenu(); return; }
    if (e.key === 'Escape') { if (mode || submenu) { mode = null; submenu = false; setHint(''); cmdKey = ''; } else if (selected.size) setSel([]); else openMenu(); e.preventDefault(); return; }
    if (!sim || ended) return;
    if (/^[1-9]$/.test(e.key)) {
      const n = Number(e.key); if (e.ctrlKey || e.metaKey) { groups.set(n, [...selected].filter(id => sim!.unit(id)?.owner === me)); e.preventDefault(); toast(`부대 ${n} 지정`); return; }
      const g = (groups.get(n) ?? []).filter(id => sim!.unit(id)); if (g.length) { setSel(g); const now = performance.now(); if (now - (hot.get(k) ?? 0) < 400) { const u = sim.unit(g[0]); if (u) view?.lookAt(u.x, u.y); } hot.set(k, now); audio.sfx('select'); e.preventDefault(); }
      return;
    }
    if (e.key === '.') { const w = sim.units.filter(u => u.owner === me && u.kind === 'worker' && u.o.t === 'idle'); if (w.length) { const i = Math.max(0, w.findIndex(u => selected.has(u.id)) + 1) % w.length; setSel([w[i].id]); view?.lookAt(w[i].x, w[i].y); } else toast('놀고 있는 일꾼이 없습니다'); return; }
    if (e.key === 'F2') { e.preventDefault(); const army = sim.units.filter(u => u.owner === me && u.kind !== 'worker' && u.o.t === 'idle'); if (army.length) { setSel(army.map(u => u.id)); audio.sfx('select'); } else toast('대기 중인 병력이 없습니다'); return; }
    if (e.code === 'Space') { e.preventDefault(); if (sim.tick - alertAt.t < 600) view?.lookAt(alertAt.x, alertAt.y); else { const h = sim.buildings.find(b => b.owner === me && b.kind === 'hq'); if (h) view?.lookAt(h.x + 2, h.y + 2); } return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const b = buttons.find(x => x.key === k); if (b) { e.preventDefault(); if (b.enabled === false) toast(b.hint ?? '지금은 할 수 없습니다', true); else { b.on(); refresh(); } }
  }
  window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
  // 창을 벗어난 사이 뗀 키·손가락은 알 수 없으므로 초점을 잃으면 모두 놓은 것으로 칩니다(안 그러면 화면이 혼자 계속 움직이거나 두 손가락 상태가 남아 다음 터치가 먹히지 않습니다).
  const onBlur = (): void => { keys.clear(); touches.clear(); pinch = 0; pointer.down = false; pointer.drag = false; };
  window.addEventListener('blur', onBlur);

  // ---------- HUD ----------
  function paintHud(): void {
    if (!sim) return; const p = sim.players[me], key = `${p.minerals}|${p.used}|${p.cap}|${Math.floor(sim.tick / TICK)}`; if (key === hudKey) return; hudKey = key;
    $('#rt-min').textContent = String(p.minerals); const s = $('#rt-sup'); s.textContent = `${p.used}/${p.cap}`; s.classList.toggle('full', p.used >= p.cap && p.cap > 0); $('#rt-time').textContent = clock(sim.tick);
    $('#rt-rate').textContent = sim.tick > 200 ? `+${Math.round(p.mined / (sim.tick / TICK / 60))}/분` : '';
  }

  // ---------- 캠페인 목표 ----------
  function paintObjectives(): void {
    const el = $('#rt-obj'); if (!camp) { if (objKey) { objKey = ''; el.innerHTML = ''; } el.classList.remove('show'); return; }
    const html = `<h4>${esc(camp.def.title)}</h4><ul>${camp.objectives.map(o => `<li class="${o.done ? 'done' : o.failed ? 'fail' : ''}${o.bonus ? ' bonus' : ''}"><i>${o.done ? '✓' : o.failed ? '✗' : o.bonus ? '★' : '◆'}</i><span>${esc(o.text)}${o.note ? `<small>${esc(o.note)}</small>` : ''}</span></li>`).join('')}</ul>`;
    el.classList.add('show'); if (html !== objKey) { objKey = html; el.innerHTML = html; }
  }
  function applyCampEvents(): void {
    if (!camp || !sim) return; const evs = camp.events; if (!evs.length) return; camp.events = [];
    for (const e of evs) {
      if (e.t === 'start') { audio.sfx('horn', 0.7); banner(`작전 ${camp.def.id} · ${camp.def.title}`, 'info'); toast(camp.def.blurb); }
      else if (e.t === 'objective') { audio.sfx('objective'); banner(`${e.bonus ? '★ 보너스 달성' : '✔ 목표 달성'} · ${e.text}`, e.bonus ? 'bonus' : 'ok'); }
      else if (e.t === 'wave') { audio.sfx('horn'); banner(e.text, 'warn'); alertAt = { x: e.x, y: e.y, t: sim.tick }; view?.ping(e.x, e.y, 0xff3b30); }
      else if (e.t === 'capture') { audio.sfx(e.mine ? 'capture' : 'lost'); toast(e.mine ? `${e.label} 점령!` : `${e.label}을(를) 빼앗겼습니다`, !e.mine); }
      else if (e.t === 'hint') toast(e.text);
    }
  }

  // ---------- 메뉴·결과 ----------
  const show = (html: string): void => {
    modal.className = 'rt-modal show wd-screen'; modal.innerHTML = html;
    modal.querySelector('.rt-card')?.classList.add('wd-panel');
    modal.querySelector('.rt-eyebrow')?.classList.add('wd-eyebrow');
    modal.querySelector('h2')?.classList.add('wd-title');
    modal.querySelectorAll('.rt-lead').forEach(el => el.classList.add('wd-lead'));
    modal.querySelectorAll('.rt-actions button').forEach(el => el.classList.add('wd-btn', el.classList.contains('primary') ? 'primary' : 'ghost'));
  };
  const hide = (): void => { modal.className = 'rt-modal'; modal.innerHTML = ''; };
  function setupScreen(): void {
    root.dataset.phase = 'setup'; paused = false; ended = false; const rec = readRtsRecords();
    show(`<div class="rt-card rt-setup" role="dialog" aria-label="FRONTLINE 시작"><span class="rt-eyebrow">FRONTLINE</span><h2>전선을 지휘하세요</h2>
      <p class="rt-lead">기지를 세우고 병력을 이끌어 전장을 지휘하세요.</p>
      <div class="rt-actions"><button class="primary" data-act="campaign" id="rt-campaign">캠페인 · 작전 ${MISSIONS.length}개</button></div>
      <div class="wd-field"><span class="wd-label">난이도</span><div class="rt-diffs wd-seg" role="group" aria-label="난이도">${DIFFICULTIES.map(d => `<button type="button" data-diff="${d}" aria-pressed="${d === difficulty}"><b>${LEVELS[d].label}</b></button>`).join('')}</div></div>
      <p class="rt-diffnote" id="rt-diffnote">${LEVELS[difficulty].blurb}</p>
      <div class="rt-actions"><button data-act="start" id="rt-start">AI와 1대1 대전</button>${PVP_ENABLED ? '<button data-act="pvp" id="rt-pvp">온라인 1대1 대전</button>' : ''}</div>
      <div class="rt-actions"><button data-act="moba" id="rt-moba">라인전 4:4</button>${PVP_ENABLED ? '<button data-act="mobaroom" id="rt-mobaroom">온라인 라인전 · 최대 4명</button>' : ''}</div>
      <div class="rt-actions sub"><button data-act="fog" id="rt-fog" aria-pressed="${fogOn}" title="적이 보이는 범위를 시야 안으로 제한합니다">전장의 안개 ${fogOn ? '켜짐' : '꺼짐'}</button><button data-act="help">조작법</button><button data-act="exit">아케이드로</button></div>
      <p class="rt-rec">${rec.matches ? `AI 대전 ${rec.matches}판 ${rec.wins}승${rec.bestWin[difficulty] ? ` · ${LEVELS[difficulty].label} 최단 승리 ${clock(rec.bestWin[difficulty] * TICK)}` : ''}` : '처음이라면 쉬움 난이도로 시작해 보세요.'}</p></div>`);
    modal.querySelector<HTMLElement>('#rt-campaign')?.focus();
  }
  const helpHtml = (): string => `<div class="rt-card"><span class="rt-eyebrow">조작법</span><h2>빠르게 익히기</h2><ul class="rt-help">
    <li><b>목표</b>일꾼으로 광물을 캐서 병영·공장을 짓고 병력을 모아 적 건물을 모두 파괴하세요.</li>
    <li><b>선택</b>왼쪽 클릭 / 드래그 · 더블 클릭은 같은 종류 · Shift 로 추가 · Ctrl+숫자로 부대 지정</li>
    <li><b>명령</b>오른쪽 클릭: 이동·공격·채취 · A 공격 이동 · S 정지 · M 이동</li>
    <li><b>건설</b>B → 건물 선택 → 클릭(Enter 는 자동 배치, Shift 는 연속 건설). 일꾼을 고르지 않아도 가까운 일꾼이 지으며, 일꾼이 죽거나 떠나도 짓다 만 건물은 다른 일꾼이 이어받습니다. 직접 보내려면 건물 선택 → C.</li>
    <li><b>강화</b>병영·공장을 선택해 E·T 로 연구하면 그 판 내내 공격력·방어력·전차 화력·이동 속도가 오릅니다. 가운데 아래쪽 중립 기지도 노려 보세요.</li>
    <li><b>병력</b>보병은 만능, 로켓병은 장갑에 강하고, 전차는 광역 피해, 정찰 지프(공장 W)는 빨라서 일꾼 사냥에 좋습니다. 의무병(병영 D)은 다친 보병·일꾼을 치료하니 부대 뒤에 두세요. 상대가 전차를 모으면 로켓병으로 맞서세요.</li>
    <li><b>능력</b>유닛을 선택하면 명령 칸에 특수 능력이 나옵니다(X·Z·V). 보병 자극제, 로켓병 일제 사격, 전차 포격 태세, 지프 질주, 의무병 응급 처치 — 영구 강화가 아니라 쿨다운마다 쓰는 순간 능력입니다.</li>
    <li><b>시야</b>전장의 안개가 켜져 있으면 아군 유닛·건물 주변만 보입니다. 정찰 지프로 먼저 길을 보세요. 설정 화면에서 끌 수 있습니다.</li>
    <li><b>캠페인</b>점령·방어·호송·급습·총공세·기습 여섯 작전. 목표를 모두 이루면 승리하고, 목표 시간·보너스 목표마다 별을 받습니다.</li>
    <li><b>일시정지</b>상단 ⏸ 버튼, P 또는 Esc (AI 대전에서만). 항복도 같은 메뉴에 있습니다.</li>
    <li><b>생산</b>건물 선택 → Q·W. 집결지는 R, 일꾼은 광물에 집결하면 바로 캡니다.</li>
    <li><b>카메라</b>화살표 · 화면 가장자리 · 휠 확대 · 미니맵 클릭 · Space 최근 공격 위치 · . 놀고 있는 일꾼</li>
    <li><b>터치</b>한 손가락 드래그는 화면 이동, 탭은 선택/명령, 두 손가락은 확대. 범위 선택 버튼으로 드래그 선택.</li></ul>
    <div class="rt-actions"><button class="primary" data-act="back">닫기</button></div></div>`;
  function openMenu(): void {
    if (root.dataset.phase === 'setup' || ended || !sim) return; paused = !net; root.dataset.phase = 'paused';
    show(`<div class="rt-card"><span class="rt-eyebrow">${net ? '대전 중 · 계속 진행됩니다' : 'FRONTLINE'}</span><h2>${net ? '설정' : '일시정지'}</h2>${net ? '' : '<p class="rt-lead">P 또는 Esc를 눌러 이어할 수 있습니다.</p>'}<div class="rt-actions col"><button class="primary" data-act="resume">이어하기</button><button data-act="help2">조작법</button><button data-act="surrender">항복</button><button data-act="exit">아케이드로</button></div></div>`);
  }
  function resultCard(win: boolean | null, why: string, extra = ''): void {
    if (!sim) return; const p = sim.players[me];
    show(`<div class="rt-card rt-result ${win ? 'win' : 'lose'}"><span class="rt-eyebrow">${pvp ? `vs ${esc(pvp.s.opponent.nickname)}` : `AI ${LEVELS[difficulty].label}`} · ${clock(sim.tick)}</span><h2>${win === null ? '무효' : win ? '승리' : '패배'}</h2><p>${esc(why)}</p>
      <dl class="rt-stats"><div><dt>시간</dt><dd>${clock(sim.tick)}</dd></div><div><dt>처치</dt><dd>${p.kills}</dd></div><div><dt>손실</dt><dd>${p.lost}</dd></div><div><dt>채취</dt><dd>${p.mined}</dd></div></dl>${extra}
      <div class="rt-actions">${pvp ? '' : '<button class="primary" data-act="again">다시 시작</button>'}<button data-act="${pvp ? 'exit' : 'setup'}" ${pvp ? 'class="primary"' : ''}>${pvp ? '아케이드로' : '설정'}</button>${pvp ? '' : '<button data-act="exit">아케이드로</button>'}</div></div>`);
  }
  function finish(): void {
    if (!sim || ended) return; ended = true; root.dataset.phase = 'over'; selected.clear(); setHint(''); mode = null;
    const win = sim.winner === me, draw = sim.winner === 2; audio.sfx(win ? 'victory' : 'defeat');
    if (camp) {
      const c = camp; if (win) { campSave = recordResult(readCampaign(), c.def.id, c.stars(), c.secs()); writeCampaign(campSave); }
      window.setTimeout(() => { if (!closed && ended && camp === c) campResult(win); }, 1400); return;
    }
    if (pvp) { void conclude(draw ? '' : win ? pvp.s.me.id : pvp.s.opponent.id, draw ? '두 쪽이 동시에 무너졌습니다' : win ? '상대의 모든 건물을 파괴했습니다' : '모든 건물을 잃었습니다'); return; }
    const rec = readRtsRecords(); rec.matches++; if (win) { rec.wins++; const t = Math.floor(sim.tick / TICK); if (!rec.bestWin[difficulty] || t < rec.bestWin[difficulty]) rec.bestWin[difficulty] = t; } rec.difficulty = difficulty; writeRtsRecords(rec);
    const finished = sim;
    window.setTimeout(() => { if (!closed && ended && sim === finished) resultCard(draw ? null : win, draw ? '무승부입니다' : win ? '적의 모든 건물을 파괴했습니다.' : '모든 건물을 잃었습니다.'); }, 1400);
  }

  // ---------- 캠페인 ----------
  const starsOf = (n: number): string => '★'.repeat(n) + '☆'.repeat(3 - n);
  function campaignScreen(): void {
    root.dataset.phase = 'setup'; paused = false; ended = false; campSave = readCampaign();
    show(`<div class="rt-card rt-camp" role="dialog" aria-label="캠페인"><span class="rt-eyebrow">FRONTLINE 캠페인</span><h2>작전 선택</h2><p class="rt-lead">앞 작전을 완수하면 다음 작전이 열립니다. 별은 완수 · 목표 시간 · 보너스 목표마다 하나씩 받습니다. 영구 강화는 없고, 매 작전은 같은 조건에서 시작합니다.</p>
      <div class="rt-missions">${MISSIONS.map(m => { const ok = unlocked(campSave, m.id), st = campSave.stars[m.id] ?? 0, best = campSave.best[m.id];
        return `<button type="button" data-mission="${m.id}" ${ok ? '' : 'aria-disabled="true"'}><span class="n">${ok ? m.id : '잠김'}</span><span class="t"><b>${m.title}<em>${m.tag}</em></b><small>${m.blurb}</small></span><span class="s"><i>${starsOf(st)}</i>${best ? `<small>최단 ${clock(best * TICK)}</small>` : ''}</span></button>`; }).join('')}</div>
      <div class="rt-actions sub"><button data-act="setup">뒤로</button></div></div>`);
    modal.querySelector<HTMLElement>('[data-mission]:not([aria-disabled])')?.focus();
  }
  function briefScreen(id: number): void {
    const m = MISSIONS.find(x => x.id === id); if (!m) return; const par = `${Math.floor(m.par / 60)}:${String(m.par % 60).padStart(2, '0')}`;
    show(`<div class="rt-card rt-brief" role="dialog" aria-label="${m.title}"><span class="rt-eyebrow">작전 ${m.id} · ${m.tag}</span><h2>${m.title}</h2><p class="rt-lead">${m.blurb}</p>
      <ul class="rt-help">${m.brief.map(t => `<li>${t}</li>`).join('')}</ul>
      <dl class="rt-starlist"><div><dt>★</dt><dd>작전 완수</dd></div><div><dt>★</dt><dd>${par} 안에 완수</dd></div><div><dt>★</dt><dd>${m.bonus}</dd></div></dl>
      <div class="rt-actions"><button class="primary" data-act="launch" data-id="${m.id}" id="rt-launch">작전 개시</button><button data-act="camp">작전 목록</button></div></div>`);
    modal.querySelector<HTMLElement>('#rt-launch')?.focus();
  }
  function beginCampaign(id: number): void {
    const def = MISSIONS.find(m => m.id === id); if (!def) return; leavePvp(); if (view) { view.dispose(); view = null; }
    sim = new RtsSim({ scripted: true, income: [1, def.income ?? 1] }); me = 0; ai = null; camp = new Campaign(def, sim); objKey = '';
    startRound(); $('#rt-vs').textContent = `작전 ${def.id} · ${def.title}`; $<HTMLButtonElement>('[data-act="speed"]').hidden = false; $<HTMLButtonElement>('[data-act="pause"]').hidden = false; speed = 1; $<HTMLButtonElement>('[data-act="speed"]').textContent = '×1';
  }
  function campResult(win: boolean): void {
    if (!sim || !camp) return; const c = camp, p = sim.players[0], o = sim.players[1], next = MISSIONS.find(m => m.id === c.def.id + 1), stars = c.stars();
    show(`<div class="rt-card rt-result ${win ? 'win' : 'lose'}"><span class="rt-eyebrow">작전 ${c.def.id} · ${esc(c.def.title)} · ${clock(sim.tick)}</span><h2>${win ? '작전 성공' : '작전 실패'}</h2><p>${esc(c.reason)}</p>
      <div class="rt-starsrow" aria-label="별 ${win ? stars : 0}개">${starsOf(win ? stars : 0)}</div>
      <ul class="rt-objs">${c.objectives.map(ob => `<li class="${ob.done ? 'done' : ''}"><i>${ob.done ? '✓' : ob.bonus ? '★' : '✗'}</i>${esc(ob.text)}</li>`).join('')}</ul>
      <dl class="rt-stats"><div><dt>처치</dt><dd>${p.kills}</dd></div><div><dt>손실</dt><dd>${p.lost}</dd></div><div><dt>적 처치</dt><dd>${o.kills}</dd></div><div><dt>시간</dt><dd>${clock(sim.tick)}</dd></div></dl>
      <div class="rt-actions">${win && next ? '<button class="primary" data-act="next">다음 작전</button>' : ''}<button ${win && next ? '' : 'class="primary"'} data-act="again">다시 하기</button><button data-act="camp">작전 목록</button></div></div>`);
  }
  /** 캠페인 화면을 떠날 때 상태를 정리합니다. */
  function dropRound(): void { if (view) { view.dispose(); view = null; } sim = null; ai = null; camp = null; vision = null; paintObjectives(); $('#rt-banner').className = 'rt-banner'; }

  // ---------- 시작 ----------
  preloadUnitKit();
  function begin(): void {
    if (view) { view.dispose(); view = null; } camp = null; objKey = ''; sim = new RtsSim({ income: [1, LEVELS[difficulty].income] });
    me = 0; ai = new RtsAi(1, difficulty); startRound(); $('#rt-vs').textContent = `AI · ${LEVELS[difficulty].label}`; $<HTMLButtonElement>('[data-act="speed"]').hidden = false; $<HTMLButtonElement>('[data-act="pause"]').hidden = false; speed = 1; $<HTMLButtonElement>('[data-act="speed"]').textContent = '×1';
  }
  function startRound(): void {
    if (!sim) return; if (view) { view.dispose(); view = null; }
    // 해제한 WebGL 컨텍스트는 다시 쓸 수 없으니 캔버스를 새로 만듭니다.
    const fresh = document.createElement('canvas'); fresh.className = 'rt-canvas'; canvas.replaceWith(fresh); canvas = fresh; const q = prefs.quality;
    try { view = new RtsView(canvas, sim, me, q); } catch { show('<div class="rt-card"><span class="rt-eyebrow">FRONTLINE</span><h2>그래픽을 시작하지 못했어요</h2><p class="rt-lead">WebGL 을 사용할 수 없습니다. 브라우저를 새로고침하거나 그래픽 가속을 켠 뒤 다시 시도해 주세요.</p><div class="rt-actions"><button class="primary" data-act="exit">메뉴로</button></div></div>'); return; }
    vision = fogOn && !net ? new Vision(sim.map.size, me) : null; vision?.update(sim, true); view.setVision(vision); fogMini = null; fogVer = -1;
    miniBase = null; alertAt = { x: 0, y: 0, t: -999 }; selected.clear(); mode = null; submenu = false; ended = false; paused = false; acc = 0; hudKey = cmdKey = selKey = ''; groups.clear(); hide(); root.dataset.phase = 'play'; stats.start = performance.now(); resize();
    const h = sim.buildings.find(b => b.owner === me && b.kind === 'hq'); if (h) setSel([h.id]);
    if (camp && h) view.lookAt((h.x + 2 + camp.rally.x) / 2, (h.y + 2 + camp.rally.y) / 2);
    if (!camp) toast(net ? '대전 시작! 상대의 모든 건물을 파괴하세요' : '일꾼으로 광물을 캐고, 병영을 지어 병력을 모으세요', false); last = performance.now();
  }

  // ---------- 온라인 대전 ----------
  function openPvpLobby(): void {
    if (!PVP_ENABLED) return;
    void import('../net/lobby').then(({ openLobby }) => openLobby({ game: 'rts', config: () => ({ mode: 'duel' }), onMatch: routeMatch, onClose: () => undefined }))
      .catch(() => show('<div class="rt-card"><span class="rt-eyebrow">온라인 1대1</span><h2>대전 기능을 불러오지 못했어요</h2><div class="rt-actions"><button class="primary" data-act="setup">돌아가기</button></div></div>'));
  }
  /** 온라인 방(2~4인) 라인전 협동. 3인 이상은 onRoom, 2인(무작위 매칭 포함)은 onMatch 로 들어옵니다. */
  function openMobaLobby(): void {
    if (!PVP_ENABLED) return;
    void import('../net/lobby').then(({ openLobby }) => openLobby({ game: 'rts', maxPlayers: 4, config: () => ({ mode: 'moba' }), onMatch: routeMatch, onRoom: s => startMoba({ players: s.players, meId: s.me.id, host: s.host, open: h => s.open(h) }), onClose: () => undefined }))
      .catch(() => show('<div class="rt-card"><span class="rt-eyebrow">온라인 방</span><h2>대전 기능을 불러오지 못했어요</h2><div class="rt-actions"><button class="primary" data-act="setup">돌아가기</button></div></div>'));
  }
  /** 같은 'rts' 로비에서 1대1 RTS 와 라인전 방이 섞이지 않도록 방장이 정한 mode 로 갈라 줍니다. */
  function routeMatch(s: PvpSession): void {
    if (s.match.config?.mode === 'moba') startMoba({ players: s.host ? [s.me, s.opponent] : [s.opponent, s.me], meId: s.me.id, host: s.host, open: h => s.open(h) }); else startPvp(s);
  }
  function startMoba(link: RoomLink): void {
    leavePvp(); root.style.display = 'none';
    void import('./moba/game').then(({ openMoba }) => openMoba(() => { root.style.display = ''; setupScreen(); }, exit, link)).catch(() => { root.style.display = ''; toast('라인전 모드를 불러오지 못했어요', true); });
  }
  function startPvp(s: PvpSession): void {
    endPvp(); pvp = { s, done: false }; ai = null; $<HTMLButtonElement>('[data-act="speed"]').hidden = true; $<HTMLButtonElement>('[data-act="pause"]').hidden = true;
    sim = new RtsSim(); me = s.host ? 0 : 1; $('#rt-vs').textContent = `vs ${s.opponent.nickname}`;
    show(`<div class="rt-card"><span class="rt-eyebrow">온라인 1대1</span><h2>${esc(s.opponent.nickname)} 님과 연결하는 중…</h2><p class="rt-lead">두 사람의 준비가 끝나면 시작합니다.</p><div class="rt-actions"><button data-act="exit">나가기</button></div></div>`);
    net = new RtsNet(s, {
      onStart: () => { if (net && pvp) startRound(); },
      onGone: reason => { if (pvp && !pvp.done) void conclude(s.me.id, reason === 'never' ? '상대가 접속하지 않았습니다' : reason === 'bye' ? '상대가 대전을 떠났습니다' : '상대와의 연결이 끊어졌습니다'); },
      onDesync: () => { if (pvp && !pvp.done) { pvp.done = true; ended = true; show('<div class="rt-card"><span class="rt-eyebrow">온라인 1대1</span><h2>동기화 오류</h2><p class="rt-lead">두 화면의 상태가 어긋나 대전을 끝냈습니다. 이 대전은 기록되지 않습니다.</p><div class="rt-actions"><button class="primary" data-act="exit">메뉴로</button></div></div>'); } },
    });
  }
  async function conclude(winner: string, why: string): Promise<void> {
    if (!pvp || pvp.done) return; pvp.done = true; ended = true; const p = pvp;
    if (!winner) { resultCard(null, why, '<p class="rt-rec">기록되지 않았습니다.</p>'); return; }
    const win = winner === p.s.me.id; resultCard(win, why, '<p class="rt-rec">결과를 기록하는 중…</p>');
    try {
      let row = await p.s.backend.report(p.s.match.id, winner);
      for (let i = 0; i < 8 && row.status === 'playing' && pvp === p && !closed; i++) { await new Promise(r => window.setTimeout(r, 3000)); row = await p.s.backend.settle(p.s.match.id); }
      if (closed || pvp !== p) return; const d = p.s.host ? row.host_delta : row.guest_delta;
      resultCard(row.status === 'finished' ? row.winner_id === p.s.me.id : win, why, `<p class="rt-rec">${row.status === 'finished' && d !== null ? `레이팅 ${d >= 0 ? '+' : ''}${d}` : row.status === 'void' ? '두 쪽의 보고가 달라 기록되지 않았습니다.' : '결과가 아직 확정되지 않았습니다.'}</p>`);
    } catch { if (!closed && pvp === p) resultCard(win, why, '<p class="rt-rec">기록을 저장하지 못했습니다. 네트워크를 확인해 주세요.</p>'); }
  }
  function leavePvp(): void {
    const p = pvp; if (!p) return;
    if (!p.done && net?.started) { net.bye(); void p.s.backend.report(p.s.match.id, p.s.opponent.id).catch(() => undefined); } else if (!p.done) void p.s.backend.cancelMatch(p.s.match.id).catch(() => undefined);
    endPvp();
  }
  function endPvp(): void { net?.dispose(); net = null; pvp = null; }

  // ---------- 루프 ----------
  function resize(): void {
    const w = root.clientWidth, h = root.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    over.width = Math.round(w * dpr); over.height = Math.round(h * dpr); view?.resize(w, h, root.dataset.phase === 'setup' ? 0 : $('.rt-bottom').offsetHeight);
  }
  const ro = new ResizeObserver(resize); ro.observe(root);
  function applyEvents(): void {
    if (!sim || !view) return; const ev = sim.drain(); if (!ev.length) return; view.consume(ev);
    for (const e of ev) {
      const near = (x: number, y: number): number => { const d = Math.hypot(x - view!.cam.x, y - view!.cam.y); return d < 30 ? 1 - d / 40 : 0.15; };
      if (e.t === 'shot') audio.sfx(e.w, near(e.x0, e.y0) * (e.w === 'bullet' ? 0.7 : 1)); else if (e.t === 'die') audio.sfx(e.building ? 'bigboom' : 'boom', near(e.x, e.y));
      else if (e.t === 'alert' && e.owner === me) { alertAt = { x: e.x, y: e.y, t: sim.tick }; audio.sfx('alert'); toast('공격받고 있습니다!', false); }
      else if (e.t === 'built' && e.owner === me) { audio.sfx('built'); toast(`${BUILDINGS[e.kind].name} 건설 완료`); }
      else if (e.t === 'researched' && e.owner === me) { audio.sfx('built'); toast(`${RESEARCH[e.r].name} 연구 완료`); }
      else if (e.t === 'rescued' && e.owner === me) toast(`일꾼이 짓다 만 ${BUILDINGS[e.kind].name} 건설을 이어받았습니다`);
      else if (e.t === 'orphan' && e.owner === me) { toast(`짓다 만 ${BUILDINGS[e.kind].name}이 있습니다 — 선택해서 '건설 이어서'를 누르세요`, true); }
      else if (e.t === 'ability' && (e.owner === me || !view.hiddenUnit({ owner: e.owner, x: e.x, y: e.y }))) audio.sfx(e.kind === 'medic' ? 'heal' : 'ability', e.owner === me ? 1 : near(e.x, e.y));
      else if (e.t === 'trained' && e.owner === me) audio.sfx('trained', 0.6); else if (e.t === 'deposit' && e.owner === me) audio.sfx('deposit', near(e.x, e.y) * 0.6);
    }
  }
  function frame(now: number): void {
    raf = requestAnimationFrame(frame); const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!sim || !view || root.dataset.phase === 'setup') return;
    if (toastT > 0 && (toastT -= dt) <= 0) $('#rt-toast').classList.remove('show');
    if (!ended && !paused) {
      if (net) { const boost = import.meta.env.DEV ? (window as unknown as { __rtsBoost?: number }).__rtsBoost ?? 1 : 1; net.pump(sim, dt * boost, () => { view!.onTick(); if (import.meta.env.DEV && sim!.tick % 20 === 0) { const l = ((window as unknown as { __rtsLog?: Array<[number, number]> }).__rtsLog ??= []); l.push([sim!.tick, sim!.hash()]); } }, 0.6 * boost); if (net.stalled) $('#rt-vs').textContent = `상대를 기다리는 중… · vs ${pvp?.s.opponent.nickname ?? ''}`; else if (pvp) $('#rt-vs').textContent = `vs ${pvp.s.opponent.nickname}`; }
      else { acc += dt * speed; let n = 0; while (acc >= 1 / TICK && n < 6 && sim.winner === -1) { sim.step(); camp?.tick(); view.onTick(); if (ai && sim.tick % ai.interval === 3) { ai.think(sim); if (ai.takeWaveWarning()) banner('적 병력이 공격을 준비합니다!', 'warn'); } acc -= 1 / TICK; n++; } if (acc > 0.5) acc = 0; }
      if (sim.winner !== -1) finish();
    }
    vision?.update(sim); applyEvents(); applyCampEvents(); if (bannerT > 0 && (bannerT -= dt) <= 0) $('#rt-banner').classList.remove('show');
    for (const id of [...selected]) { const e = sim.index.get(id); if (!e) selected.delete(id); }
    // 카메라 이동: 화살표 키와 화면 가장자리
    if (!paused) {
      const sp = view.cam.dist * 0.9 * dt; let dx = 0, dy = 0;
      if (keys.has('ArrowLeft')) dx -= 1; if (keys.has('ArrowRight')) dx += 1; if (keys.has('ArrowUp')) dy -= 1; if (keys.has('ArrowDown')) dy += 1;
      if (!touch && pointer.in && !pointer.down && root.dataset.phase === 'play' && !modal.classList.contains('show')) { const m = 14, w = over.clientWidth, h = over.clientHeight; if (pointer.x < m) dx -= 1; if (pointer.x > w - m) dx += 1; if (pointer.y < m) dy -= 1; if (pointer.y > h - m) dy += 1; }
      if (dx || dy) view.pan(dx * sp, dy * sp);
    }
    if (mode?.t === 'build' && pointer.in && !touch) { const g = view.ground(pointer.x, pointer.y); if (g) { const at = ghostAt(g.x, g.y, mode.kind); view.setGhost(mode.kind, at.x, at.y, sim.canPlace(mode.kind, at.x, at.y) && sim.players[me].minerals >= BUILDINGS[mode.kind].cost); } }
    else if (mode?.t === 'build' && touch) { const g = view.ground(over.clientWidth / 2, over.clientHeight / 2.2); if (g) { const at = ghostAt(g.x, g.y, mode.kind); view.setGhost(mode.kind, at.x, at.y, sim.canPlace(mode.kind, at.x, at.y)); } } else view.setGhost(null);
    const { bs } = own(); const rb = bs.find(b => b.done && BUILDINGS[b.kind].trains.length && (b.rx || b.ry)); view.setRally(rb && bs.length === 1 ? { x: rb.rx, y: rb.ry } : null);
    view.render(dt, Math.min(1, acc * TICK), selected);
    over.style.cursor = mode?.t === 'attack' ? 'crosshair' : mode ? 'cell' : 'default';
    uiT += dt; miniT += dt; if (uiT > 0.12) { uiT = 0; paintHud(); paintCommands(); paintSelection(); paintObjectives(); view.setMarkers(camp ? camp.markerList() : []); } if (miniT > 0.1) { miniT = 0; drawMini(); } drawOverlay();
  }

  // ---------- 버튼 ----------
  function exit(): void {
    if (closed) return; closed = true; leavePvp(); cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); window.removeEventListener('blur', onBlur); window.removeEventListener('waldo:preferences', onPrefs);
    view?.dispose(); audio.dispose(); root.remove(); onExit();
  }
  const onPrefs = (): void => { const s = readPreferences().sound; audio.enabled = s; const m = root.querySelector<HTMLElement>('[data-act="mute"]'); if (m) { m.textContent = s ? '🔊' : '🔇'; m.setAttribute('aria-pressed', String(s)); } };
  window.addEventListener('waldo:preferences', onPrefs);
  root.addEventListener('click', e => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-diff],[data-mission]'); if (!t) return; audio.unlock();
    if (t.dataset.mission) { const id = Number(t.dataset.mission); if (unlocked(campSave, id)) { audio.sfx('click'); briefScreen(id); } else { audio.sfx('error'); toast('앞 작전을 먼저 완수하세요', true); } return; }
    if (t.dataset.diff) { difficulty = t.dataset.diff as Difficulty; modal.querySelectorAll<HTMLElement>('[data-diff]').forEach(b => b.setAttribute('aria-pressed', String(b === t))); $('#rt-diffnote').textContent = LEVELS[difficulty].blurb; audio.sfx('click'); return; }
    switch (t.dataset.act) {
      case 'start': leavePvp(); begin(); break;
      case 'again': if (camp) beginCampaign(camp.def.id); else { leavePvp(); begin(); } break;
      case 'campaign': campaignScreen(); break;
      case 'camp': dropRound(); campaignScreen(); break;
      case 'launch': beginCampaign(Number(t.dataset.id)); break;
      case 'next': if (camp) { const id = camp.def.id + 1; dropRound(); briefScreen(id); } break;
      case 'fog': fogOn = !fogOn; writeFog(fogOn); audio.sfx('click'); setupScreen(); break;
      case 'pvp': openPvpLobby(); break;
      case 'mobaroom': openMobaLobby(); break;
      case 'moba': {
        root.style.display = 'none';
        void import('./moba/game').then(({ openMoba }) => openMoba(() => { root.style.display = ''; setupScreen(); }, exit)).catch(() => { root.style.display = ''; toast('라인전 모드를 불러오지 못했어요', true); });
        break;
      }
      case 'help': show(helpHtml().replace('data-act="back"', 'data-act="setup"')); break;
      case 'help2': show(helpHtml().replace('data-act="back"', 'data-act="resume"')); break;
      case 'back': case 'setup': leavePvp(); dropRound(); setupScreen(); break;
      case 'resume': hide(); paused = false; root.dataset.phase = 'play'; last = performance.now(); break;
      case 'surrender': hide(); paused = false; root.dataset.phase = 'play'; issue({ k: 'surrender' }); break;
      case 'exit': exit(); break;
      case 'mute': { const s = !audio.enabled; audio.enabled = s; writePreferences({ ...readPreferences(), sound: s }); onPrefs(); break; }
      case 'menu': openMenu(); break;
      case 'pause': if (net) toast('온라인 대전은 일시정지할 수 없습니다', true); else openMenu(); break;
      case 'speed': speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; t.textContent = `×${speed}`; break;
    }
  });
  if (import.meta.env.DEV) (window as unknown as { __rts: unknown }).__rts = { get sim() { return sim; }, get view() { return view; }, get ai() { return ai; }, get camp() { return camp; }, get vision() { return vision; }, beginCampaign, select: (ids: number[]) => setSel(ids), begin, step: (n: number) => { for (let i = 0; i < n && sim; i++) { sim.step(); camp?.tick(); view?.onTick(); if (ai && sim.tick % ai.interval === 3) ai.think(sim); } }, issue, me: () => me, setDifficulty: (d: Difficulty) => { difficulty = d; } };

  raf = requestAnimationFrame(frame); resize(); options.loading?.close(); setupScreen();
}
void SUPPLY_MAX;
