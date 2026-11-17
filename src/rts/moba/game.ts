// FRONTLINE 롤식 라인전 — 진입점: 챔피언 선택, 입력(우클릭 이동·QWER 스킬), HUD, 상점, 게임 루프.
import './moba.css';
import { readPreferences, writePreferences } from '../../prefs';
import { RtsAudio } from '../audio';
import { TICK } from '../config';
import { MobaAi } from './ai';
import { CHAMP_IDS, CHAMPS, ITEMS, ITEM_IDS, LANES, LANE_PTS, LEVELS, MAX_ITEMS, NEXUS, SIZE, xpNeed, type ChampId, type ItemId, type Lane, type Level, type Role } from './config';
import { MobaSim, type Ent } from './sim';
import { MobaView } from './view';

const esc = (s: string): string => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
const clock = (ticks: number): string => { const s = Math.floor(ticks / TICK); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const LANE_NAME: Record<Role, string> = { top: '탑', mid: '미드', bot: '바텀', jungle: '정글' };
const KEYS = ['Q', 'W', 'E', 'R'];

export function openMoba(onBack: () => void, onExit: () => void): void {
  const prefs = readPreferences(), touch = matchMedia('(pointer: coarse)').matches;
  const root = document.createElement('div'); root.className = 'mb-root' + (touch ? ' touch' : ''); root.dataset.phase = 'setup';
  root.innerHTML = `<canvas class="mb-canvas"></canvas><canvas class="mb-over"></canvas>
    <div class="mb-top"><div class="mb-gold" title="골드"><i></i><b id="mb-gold">0</b></div>
      <div class="mb-score"><span class="b" id="mb-kb">0</span><span class="t" id="mb-time">0:00</span><span class="r" id="mb-kr">0</span></div>
      <div class="mb-btns"><button data-act="board" title="점수판 (Tab)">📊</button><button data-act="pause" class="mb-pause" title="일시정지 (Esc)">⏸ 일시정지</button><button data-act="mute" aria-pressed="${prefs.sound}">${prefs.sound ? '🔊' : '🔇'}</button></div></div>
    <div class="mb-ann" id="mb-ann" role="status" aria-live="polite"></div><div class="mb-hint" id="mb-hint"></div>
    <div class="mb-bottom"><div class="mb-mini"><canvas id="mb-mini" width="200" height="200" aria-label="미니맵"></canvas></div>
      <div class="mb-hud"><div class="mb-hero"><b class="mb-lv" id="mb-lv">1</b><div class="mb-bars"><div class="mb-bar hp"><i id="mb-hp"></i><span id="mb-hpt"></span></div><div class="mb-bar mp"><i id="mb-mp"></i><span id="mb-mpt"></span></div><div class="mb-bar xp"><i id="mb-xp"></i></div></div></div>
        <div class="mb-skills" id="mb-skills"></div><div class="mb-items" id="mb-items"></div></div>
      <div class="mb-side"><button data-act="shop" id="mb-shopbtn"><b>상점</b><kbd>P</kbd></button><button data-act="recall" id="mb-recall"><b>귀환</b><kbd>B</kbd></button><button data-act="center"><b>시점</b><kbd>Space</kbd></button></div></div>
    <div class="mb-modal" id="mb-modal"></div>`;
  document.body.append(root);
  const $ = <T extends HTMLElement>(s: string): T => root.querySelector<T>(s)!;
  let canvas = $<HTMLCanvasElement>('.mb-canvas'); const over = $<HTMLCanvasElement>('.mb-over'), og = over.getContext('2d')!, mini = $<HTMLCanvasElement>('#mb-mini'), mg = mini.getContext('2d')!, modal = $('#mb-modal');
  const audio = new RtsAudio(); audio.enabled = prefs.sound;

  let sim: MobaSim | null = null, view: MobaView | null = null; let ais: MobaAi[] = [];
  let champ: ChampId = 'blade', lane: Lane = 'mid', level: Level = 'normal';
  let raf = 0, last = 0, acc = 0, paused = false, ended = false, closed = false, free = false, amove = false, aimIdx = -1, annT = 0, uiT = 0, skillKey = '', itemKey = '';
  const keys = new Set<string>(); const pointer = { x: 0, y: 0, in: false, right: false, lastCmd: 0 }; const floats: Array<{ x: number; y: number; amt: number; t: number; team: number; id: number }> = [];
  const feed: Array<{ text: string; t: number }> = []; const touches = new Map<number, { x: number; y: number }>(); let pinch = 0;

  const me = (): Ent | undefined => sim?.me();
  const say = (text: string, bad = false): void => { const el = $('#mb-ann'); el.textContent = text; el.className = `mb-ann show${bad ? ' bad' : ''}`; annT = 2.6; if (bad) audio.sfx('error'); };
  const hint = (t: string): void => { $('#mb-hint').textContent = t; $('#mb-hint').classList.toggle('show', !!t); };
  const cmd = (c: Parameters<MobaSim['apply']>[1]): boolean => { if (!sim || ended) return false; return sim.apply(sim.heroIds[0], c); };

  // ---------- 입력 ----------
  function orderAt(sx: number, sy: number, forceMove = false): void {
    if (!sim || !view) return; const m = me(); if (!m || m.hero!.dead) return;
    const id = forceMove ? 0 : view.pick(sx, sy, m.id), t = id ? sim.get(id) : undefined, g = view.ground(sx, sy);
    if (t && t.team !== m.team && sim.vulnerable(t)) { cmd({ k: 'attack', target: t.id }); audio.sfx('select'); return; }
    if (g) { if (amove) { cmd({ k: 'amove', x: g.x, y: g.y }); amove = false; hint(''); } else cmd({ k: 'move', x: g.x, y: g.y }); view.consume([{ t: 'blast', x: g.x, y: g.y, r: 0.7, team: 0 }], 0); audio.sfx('order'); }
  }
  /** 스킬을 눌렀을 때의 조준점: 커서가 가리키는 땅(터치는 가장 가까운 적). */
  function aimPoint(idx: number): { x: number; y: number } {
    const m = me()!; const g = !touch && pointer.in && view ? view.ground(pointer.x, pointer.y) : null; if (g) return g;
    const k = sim!.skill(m, idx); let best: Ent | null = null, bd = Math.max(k.range, 7) + 2;
    for (const e of sim!.ents) if (e.team !== m.team && e.hp > 0 && !e.hero?.dead && sim!.vulnerable(e)) { const d = sim!.dist(m, e); if (d < bd) { bd = d; best = e; } }
    return best ? { x: best.x, y: best.y } : { x: m.x + m.fx * 6, y: m.y + m.fy * 6 };
  }
  function cast(idx: number, at?: { x: number; y: number }): void {
    if (!sim || ended) return; const m = me(); if (!m || m.hero!.dead) return; const p = at ?? aimPoint(idx), h = m.hero!, k = sim.skill(m, idx);
    if (!h.rank[idx]) { say(sim.canLearn(m, idx) ? `${k.name}: 스킬 포인트로 먼저 배우세요 (Ctrl+${KEYS[idx]} 또는 + 버튼)` : `${k.name}은(는) 아직 배울 수 없습니다 (궁극기는 3·6·9레벨에 배웁니다)`, true); return; }
    if (sim.tick < h.ready[idx]) { say('아직 쓸 수 없습니다 (재사용 대기)', true); return; }
    if (h.mp < k.mana) { say('마나가 부족합니다', true); return; }
    if (cmd({ k: 'cast', i: idx, x: p.x, y: p.y })) audio.sfx(k.kind === 'shot' ? 'rocket' : k.kind === 'buff' ? 'built' : 'cannon', 0.7);
  }
  function learn(idx: number): void { if (!sim || ended) return; const m = me(); if (m && cmd({ k: 'learn', i: idx })) { audio.sfx('built', 0.5); say(`${sim.skill(m, idx).name} 강화! (${m.hero!.rank[idx]}단계)`); } }
  const hot = (idx: number): void => { if (touch) cast(idx); else { aimIdx = idx; } };
  function onKey(e: KeyboardEvent): void {
    const k = e.key.toUpperCase();
    if (e.type === 'keydown' && (e.ctrlKey || e.metaKey) && KEYS.includes(k)) { e.preventDefault(); learn(KEYS.indexOf(k)); return; }
    if (e.type === 'keyup') { keys.delete(e.code); const i = KEYS.indexOf(k); if (i >= 0 && aimIdx === i) { aimIdx = -1; view?.setAim(null); cast(i); } return; }
    keys.add(e.code); audio.unlock();
    if (e.key === 'Escape') { e.preventDefault(); if (root.dataset.phase === 'paused') resume(); else if (modal.classList.contains('show') && root.dataset.phase === 'play') hide(); else if (aimIdx >= 0) { aimIdx = -1; view?.setAim(null); } else if (amove) { amove = false; hint(''); } else openMenu(); return; }
    if (root.dataset.phase === 'paused') return; if (!sim || ended || root.dataset.phase !== 'play') return; if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Tab') { e.preventDefault(); if (modal.classList.contains('show')) hide(); else board(); return; }
    if (k === 'P') { e.preventDefault(); if (modal.classList.contains('show')) hide(); else shop(); return; }
    if (modal.classList.contains('show')) return;
    const i = KEYS.indexOf(k); if (i >= 0 && !e.repeat) { e.preventDefault(); hot(i); return; }
    if (k === 'B') { cmd({ k: 'recall' }); return; } if (k === 'S') { cmd({ k: 'stop' }); return; }
    if (k === 'A') { amove = true; hint('공격 이동: 갈 곳을 클릭하세요'); return; }
    if (e.code === 'Space') { e.preventDefault(); free = false; return; }
  }
  window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
  const rectOf = (): DOMRect => over.getBoundingClientRect(); const local = (e: PointerEvent): { x: number; y: number } => { const r = rectOf(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  over.addEventListener('contextmenu', e => e.preventDefault());
  over.addEventListener('pointerdown', e => {
    audio.unlock(); if (!sim || !view || ended || root.dataset.phase !== 'play') return; const p = local(e); pointer.x = p.x; pointer.y = p.y; pointer.in = true; over.setPointerCapture(e.pointerId);
    if (e.pointerType === 'touch') { touches.set(e.pointerId, p); if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); return; } orderAt(p.x, p.y); return; }
    if (aimIdx >= 0 && e.button === 0) { const i = aimIdx; aimIdx = -1; view.setAim(null); cast(i, view.ground(p.x, p.y) ?? undefined); return; }
    if (e.button === 2) { pointer.right = true; orderAt(p.x, p.y); pointer.lastCmd = performance.now(); return; }
    if (e.button === 0) orderAt(p.x, p.y);
  });
  over.addEventListener('pointermove', e => {
    const p = local(e); pointer.x = p.x; pointer.y = p.y; pointer.in = true;
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) { touches.set(e.pointerId, p); if (touches.size === 2 && view) { const [a, b] = [...touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch > 0) view.zoom(pinch / d); pinch = d; } return; }
    if (pointer.right && performance.now() - pointer.lastCmd > 120) { pointer.lastCmd = performance.now(); orderAt(p.x, p.y, true); }
  });
  const up = (e: PointerEvent): void => { touches.delete(e.pointerId); if (touches.size < 2) pinch = 0; if (e.button === 2) pointer.right = false; };
  over.addEventListener('pointerup', up); over.addEventListener('pointercancel', up); over.addEventListener('pointerleave', () => { pointer.in = false; pointer.right = false; });
  over.addEventListener('wheel', e => { e.preventDefault(); view?.zoom(e.deltaY > 0 ? 1.08 : 0.92); }, { passive: false });
  mini.addEventListener('pointerdown', e => { e.preventDefault(); if (!sim || !view) return; const r = mini.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * SIZE, y = (e.clientY - r.top) / r.height * SIZE; if (e.button === 2) { cmd({ k: 'move', x, y }); return; } view.lookAt(x, y); free = true; });
  mini.addEventListener('contextmenu', e => e.preventDefault());
  $('#mb-skills').addEventListener('pointerdown', e => { const l = (e.target as HTMLElement).closest<HTMLElement>('[data-learn]'); if (l) { e.preventDefault(); e.stopPropagation(); learn(Number(l.dataset.learn)); return; } const b = (e.target as HTMLElement).closest<HTMLElement>('[data-sk]'); if (!b) return; e.preventDefault(); cast(Number(b.dataset.sk)); });
  $('#mb-items').addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-sell]'); void b; shop(); });

  // ---------- 화면 조각 ----------
  const bar = (v: number, max: number): string => `${Math.max(0, Math.min(100, v / Math.max(1, max) * 100)).toFixed(0)}%`;
  function paintHud(): void {
    if (!sim) return; const m = me(); if (!m) return; const h = m.hero!;
    $('#mb-gold').textContent = String(Math.floor(h.gold)); $('#mb-kb').textContent = String(sim.teams[0].kills); $('#mb-kr').textContent = String(sim.teams[1].kills); $('#mb-time').textContent = clock(sim.tick);
    $('#mb-lv').textContent = String(h.level); $('#mb-hp').style.width = bar(m.hp, m.maxhp); $('#mb-hpt').textContent = `${Math.ceil(m.hp)} / ${m.maxhp}${h.shield > 0 && sim.tick < h.shieldUntil ? ` (+${Math.ceil(h.shield)})` : ''}`;
    $('#mb-mp').style.width = bar(h.mp, h.maxmp); $('#mb-mpt').textContent = `${Math.ceil(h.mp)} / ${h.maxmp}`; $('#mb-xp').style.width = h.level >= 15 ? '100%' : bar(h.xp, xpNeed(h.level));
    const d = CHAMPS[h.champ], sk = d.skills.map((k, i) => { const cd = Math.max(0, h.ready[i] - sim!.tick), lock = !h.rank[i], no = h.mp < k.mana, up = h.points > 0 && sim!.canLearn(me()!, i), pips = '●'.repeat(h.rank[i]) + '○'.repeat(Math.max(0, (i === 3 ? 3 : 5) - h.rank[i])); return `<button type="button" data-sk="${i}" class="${lock ? 'lock' : ''}${no && !cd ? ' nomp' : ''}${aimIdx === i ? ' on' : ''}" title="${esc(k.name)} — ${esc(k.desc)}"><b>${esc(k.name)}</b><kbd>${KEYS[i]}</kbd><small>${lock ? (up ? '배우기' : '잠김') : `마나 ${k.mana}`}</small><u class="pips">${pips}</u>${up ? `<i class="plus" data-learn="${i}" title="스킬 강화 (Ctrl+${KEYS[i]})">+</i>` : ''}${cd ? `<span class="cd" style="--p:${cd / k.cd}">${(cd / TICK).toFixed(cd > 60 ? 0 : 1)}</span>` : ''}</button>`; }).join('');
    if (sk !== skillKey) { skillKey = sk; $('#mb-skills').innerHTML = sk; }
    const it = Array.from({ length: MAX_ITEMS }, (_, i) => { const id = h.items[i]; return id ? `<span class="it" title="${esc(ITEMS[id].name)} — ${esc(ITEMS[id].role)}">${esc(ITEMS[id].name.slice(0, 2))}</span>` : '<span class="it empty"></span>'; }).join('');
    if (it !== itemKey) { itemKey = it; $('#mb-items').innerHTML = it; }
    $('#mb-shopbtn').classList.toggle('ready', sim.inBase(m) || h.dead); $('#mb-recall').classList.toggle('on', h.recall > 0);
    if (modal.classList.contains('show') && root.dataset.phase === 'play' && modal.dataset.kind === 'shop') paintShop();
  }
  let miniBase: HTMLCanvasElement | null = null;
  function drawMini(): void {
    if (!sim || !view) return; const k = mini.width / SIZE;
    if (!miniBase) {
      miniBase = document.createElement('canvas'); miniBase.width = miniBase.height = mini.width; const g = miniBase.getContext('2d')!; g.fillStyle = '#3f5a35'; g.fillRect(0, 0, 200, 200);
      g.fillStyle = '#24301f'; for (const b of sim.map.boulders) { g.beginPath(); g.arc(b.x * k, b.y * k, b.r * k, 0, 6.3); g.fill(); }
      g.strokeStyle = '#a8946a'; g.lineWidth = 3.2; g.lineJoin = 'round'; for (const l of LANES) { g.beginPath(); LANE_PTS[l].forEach((p, i) => (i ? g.lineTo(p.x * k, p.y * k) : g.moveTo(p.x * k, p.y * k))); g.stroke(); }
    }
    mg.drawImage(miniBase, 0, 0);
    for (const e of sim.ents) {
      if (e.hp <= 0 || e.hero?.dead) continue; const x = e.x * k, y = e.y * k; mg.fillStyle = e.team === 0 ? '#5aa0ff' : e.team === 1 ? '#ff6a4a' : '#d6c070';
      if (e.kind === 'nexus') mg.fillRect(x - 5, y - 5, 10, 10); else if (e.kind === 'turret') mg.fillRect(x - 2.5, y - 2.5, 5, 5); else if (e.hero) { mg.beginPath(); mg.arc(x, y, 4, 0, 6.3); mg.fill(); if (e.id === sim.heroIds[0]) { mg.strokeStyle = '#ffd24a'; mg.lineWidth = 2; mg.stroke(); } } else mg.fillRect(x - 1, y - 1, 2, 2);
    }
    const cs = view.corners(over.clientHeight - $('.mb-bottom').offsetHeight); if (cs.length > 2) { mg.strokeStyle = '#fff'; mg.lineWidth = 1.2; mg.beginPath(); cs.forEach((c, i) => { const x = Math.min(SIZE, Math.max(0, c.x)) * k, y = Math.min(SIZE, Math.max(0, c.y)) * k; if (i) mg.lineTo(x, y); else mg.moveTo(x, y); }); mg.closePath(); mg.stroke(); }
  }
  function drawOverlay(dt: number): void {
    if (!sim || !view) return; const w = over.clientWidth, h = over.clientHeight; og.clearRect(0, 0, over.width, over.height); const dpr = over.width / Math.max(1, w); og.setTransform(dpr, 0, 0, dpr, 0, 0);
    const m = me(); og.textAlign = 'center';
    for (const e of sim.ents) {
      if (e.hp <= 0 || e.hero?.dead) continue; const lift = e.kind === 'hero' ? 2.6 : e.kind === 'nexus' ? 5.4 : e.kind === 'turret' ? 4.6 : e.kind === 'monster' ? 2.6 + e.radius : 1.5; const p = view.project(e.x, e.y, lift); if (!p || p.x < -40 || p.y < -40 || p.x > w + 40 || p.y > h + 40) continue;
      if (e.kind === 'hero' || e.kind === 'turret' || e.kind === 'nexus' || e.kind === 'monster' || e.hp < e.maxhp) {
        const bw = e.kind === 'nexus' ? 90 : e.kind === 'turret' ? 56 : e.kind === 'hero' ? 62 : e.kind === 'monster' ? 40 + e.radius * 14 : 26, f = Math.max(0, e.hp / e.maxhp), mine = e.team === m?.team;
        og.fillStyle = 'rgba(0,0,0,.7)'; og.fillRect(p.x - bw / 2 - 1, p.y - 1, bw + 2, e.hero ? 9 : 6); og.fillStyle = e.team === 2 ? '#e0b84a' : mine ? (e.id === m?.id ? '#7cf0a8' : '#4aa0ff') : '#ff5a4a'; og.fillRect(p.x - bw / 2, p.y, bw * f, e.hero ? 7 : 4);
        if (e.hero) { const hh = e.hero; og.fillStyle = '#7ab6ff'; og.fillRect(p.x - bw / 2, p.y + 7, bw * hh.mp / Math.max(1, hh.maxmp), 2); og.font = '700 11px system-ui,sans-serif'; og.fillStyle = '#fff'; og.strokeStyle = 'rgba(0,0,0,.8)'; og.lineWidth = 3; const label = `${hh.level} ${hh.name}`; og.strokeText(label, p.x, p.y - 5); og.fillText(label, p.x, p.y - 5); }
      }
    }
    for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.t += dt; if (f.t > 0.9) { floats.splice(i, 1); continue; } const p = view.project(f.x, f.y, 2.2 + f.t * 2.2); if (!p) continue; og.globalAlpha = 1 - f.t / 0.9; og.font = `800 ${f.amt >= 100 ? 17 : 13}px system-ui,sans-serif`; og.fillStyle = f.team === m?.team ? '#ff7a6a' : '#fff6c8'; og.strokeStyle = 'rgba(0,0,0,.85)'; og.lineWidth = 3; og.strokeText(String(f.amt), p.x, p.y); og.fillText(String(f.amt), p.x, p.y); og.globalAlpha = 1; }
    if (m && !m.hero!.dead && m.hero!.recall > 0) { const p = view.project(m.x, m.y, 4.2); if (p) { og.fillStyle = 'rgba(0,0,0,.7)'; og.fillRect(p.x - 31, p.y, 62, 6); og.fillStyle = '#9fd8ff'; og.fillRect(p.x - 30, p.y + 1, 60 * (1 - m.hero!.recall / (TICK * 4)), 4); } }
    // 피드(최근 처치·알림)
    const now = performance.now(); og.textAlign = 'right'; og.font = '600 12px system-ui,sans-serif'; let y = 58; for (let i = feed.length - 1; i >= 0; i--) { if (now - feed[i].t > 6000) { feed.splice(i, 1); continue; } og.globalAlpha = Math.min(1, (6000 - (now - feed[i].t)) / 1000); og.fillStyle = 'rgba(14,16,19,.78)'; const tw = og.measureText(feed[i].text).width + 16; og.fillRect(w - tw - 10, y - 13, tw, 20); og.fillStyle = '#f1eee6'; og.fillText(feed[i].text, w - 18, y + 1); y += 24; og.globalAlpha = 1; }
  }

  // ---------- 상점·점수판·메뉴 ----------
  const show = (html: string, kind = ''): void => { modal.className = 'mb-modal show'; modal.dataset.kind = kind; modal.innerHTML = html; };
  const hide = (): void => { modal.className = 'mb-modal'; modal.dataset.kind = ''; modal.innerHTML = ''; };
  let shopKey = '';
  function shop(): void { show('', 'shop'); shopKey = ''; paintShop(); }
  /** 값이 바뀔 때만 다시 그립니다(매 프레임 다시 그리면 누르는 도중 버튼이 사라집니다). */
  function paintShop(): void {
    if (!sim) return; const m = me()!, h = m.hero!, can = sim.inBase(m) || h.dead, key = `${Math.floor(h.gold)}|${h.items.join()}|${can}`; if (key === shopKey) return; shopKey = key;
    modal.innerHTML = `<div class="mb-card mb-shop" role="dialog" aria-label="상점"><div class="mb-row"><span class="mb-eyebrow">상점</span><b class="mb-g"><i></i>${Math.floor(h.gold)}</b></div><p class="mb-lead">${can ? '살 아이템을 누르세요. 최대 6개까지 가질 수 있습니다.' : '기지(분수대 근처)에서만 살 수 있습니다. B 로 귀환하세요.'}</p>
      <div class="mb-shopgrid">${ITEM_IDS.map(id => { const it = ITEMS[id], ok = can && h.gold >= it.cost && h.items.length < MAX_ITEMS; return `<button type="button" data-buy="${id}" ${ok ? '' : 'aria-disabled="true"'}><b>${esc(it.name)}</b><small>${esc(it.role)}</small><em>◆ ${it.cost}</em></button>`; }).join('')}</div>
      <div class="mb-actions"><button class="primary" data-act="closeModal">닫기 (P)</button></div></div>`;
  }
  function board(): void {
    if (!sim) return; const rows = sim.heroes().sort((a, b) => a.team - b.team).map(e => { const h = e.hero!; return `<tr class="${e.team === 0 ? 'b' : 'r'}${e.id === sim!.heroIds[0] ? ' me' : ''}"><td>${esc(h.name)}${e.id === sim!.heroIds[0] ? ' (나)' : ''}</td><td>${LANE_NAME[h.lane]}</td><td>${h.level}</td><td>${h.kills}/${h.deaths}/${h.assists}</td><td>${h.cs}</td><td>${h.items.map(i => esc(ITEMS[i].name.slice(0, 2))).join(' ')}</td></tr>`; }).join('');
    show(`<div class="mb-card"><span class="mb-eyebrow">점수판 · ${clock(sim.tick)}</span><table class="mb-table"><thead><tr><th>챔피언</th><th>라인</th><th>Lv</th><th>K/D/A</th><th>CS</th><th>아이템</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="mb-lead">포탑 청 ${sim.teams[0].towers} · 적 ${sim.teams[1].towers} / 드래곤 청 ${sim.teams[0].drakes} · 적 ${sim.teams[1].drakes}</p><div class="mb-actions"><button class="primary" data-act="closeModal">닫기</button></div></div>`, 'board');
  }
  function openMenu(): void { if (root.dataset.phase !== 'play' || ended) return; paused = true; root.dataset.phase = 'paused'; show('<div class="mb-card"><span class="mb-eyebrow">게임이 멈춰 있습니다</span><h2>일시정지</h2><p class="mb-lead">Esc 를 누르면 계속합니다.</p><div class="mb-actions col"><button class="primary" data-act="resume">계속하기</button><button data-act="help2">조작법</button><button data-act="surrender">항복</button><button data-act="setup">챔피언 선택으로</button><button data-act="back">라인 모드 나가기</button></div></div>', 'menu'); }
  function resume(): void { hide(); paused = false; root.dataset.phase = 'play'; last = performance.now(); }
  const helpHtml = (back: string): string => `<div class="mb-card"><span class="mb-eyebrow">조작법</span><h2>롤식 라인전</h2><ul class="mb-help">
    <li><b>목표</b>적 넥서스를 부수면 승리. 포탑은 바깥쪽부터 차례로 무너뜨려야 안쪽이 열립니다.</li>
    <li><b>이동·공격</b>오른쪽 클릭(꾹 누르면 계속 이동), 적 위를 누르면 그 적을 공격합니다. A 공격 이동, S 정지.</li>
    <li><b>스킬</b>Q W E R 을 누르고 있으면 범위가 보이고, 떼면 커서 방향으로 시전합니다(R 은 3레벨부터).</li>
    <li><b>미니언·성장</b>미니언 막타로 골드를 얻고, 근처에서 경험치를 나눠 받습니다. 정글 몬스터와 강의 드래곤·군주도 큰 보상입니다.</li>
    <li><b>상점·귀환</b>P 상점(기지에서만 구매), B 귀환(4초 동안 맞지 않아야 함). 기지 분수대에서 체력·마나가 빠르게 찹니다.</li>
    <li><b>시점</b>휠 확대, Space 영웅에게 돌아오기, 미니맵 클릭 이동. Tab 점수판, Esc 일시정지.</li>
    <li><b>터치</b>화면을 눌러 이동·공격, 스킬 버튼을 누르면 가까운 적에게 시전, 두 손가락으로 확대.</li></ul><div class="mb-actions"><button class="primary" data-act="${back}">닫기</button></div></div>`;

  // ---------- 시작 ----------
  function setupScreen(): void {
    root.dataset.phase = 'setup'; paused = false; ended = false; if (view) { view.dispose(); view = null; } sim = null; ais = []; hint('');
    const cd = (id: ChampId): string => { const d = CHAMPS[id]; return `<button type="button" data-champ="${id}" aria-pressed="${id === champ}"><b>${d.name}</b><small>${d.role}</small><em>${d.blurb}</em><ul>${d.skills.map(s => `<li><kbd>${s.key}</kbd>${esc(s.name)}</li>`).join('')}</ul></button>`; };
    show(`<div class="mb-card mb-setup" role="dialog" aria-label="라인전 시작"><span class="mb-eyebrow">FRONTLINE · 라인전</span><h2>소환사의 협곡 3 대 3</h2>
      <p class="mb-lead">챔피언 하나를 직접 조종해 라인을 밀고, 포탑을 부수고, 적 넥서스를 무너뜨리세요. 미니언 웨이브·정글·드래곤·군주·상점이 모두 있습니다.</p>
      <div class="mb-champs" role="group" aria-label="챔피언">${CHAMP_IDS.map(cd).join('')}</div>
      <div class="mb-pick"><span>라인</span><div role="group" aria-label="라인">${LANES.map(l => `<button type="button" data-lane="${l}" aria-pressed="${l === lane}">${LANE_NAME[l]}</button>`).join('')}</div><span>난이도</span><div role="group" aria-label="난이도">${(Object.keys(LEVELS) as Level[]).map(l => `<button type="button" data-level="${l}" aria-pressed="${l === level}">${LEVELS[l].label}</button>`).join('')}</div></div>
      <p class="mb-lead" id="mb-levelnote">${LEVELS[level].blurb}</p>
      <div class="mb-actions"><button class="primary" data-act="start" id="mb-start">시작</button><button data-act="help">조작법</button><button data-act="back">RTS 로 돌아가기</button></div></div>`, 'setup');
    modal.querySelector<HTMLElement>('#mb-start')?.focus();
  }
  function begin(): void {
    const others = LANES.filter(l => l !== lane), allies = others.map((l, i) => ({ champ: CHAMP_IDS[(CHAMP_IDS.indexOf(champ) + 1 + i) % CHAMP_IDS.length], lane: l })), foes = LANES.map((l, i) => ({ champ: CHAMP_IDS[(i + CHAMP_IDS.indexOf(champ) + 2) % CHAMP_IDS.length], lane: l }));
    if (view) { view.dispose(); view = null; }
    sim = new MobaSim({ player: champ, lane, allies, foes }); ais = [new MobaAi(0, level), new MobaAi(1, level)];
    for (const hh of sim.heroes(1)) hh.hero!.gold = Math.round(hh.hero!.gold * LEVELS[level].goldMul);
    const fresh = document.createElement('canvas'); fresh.className = 'mb-canvas'; canvas.replaceWith(fresh); canvas = fresh;
    try { view = new MobaView(canvas, sim, prefs.quality); } catch { show('<div class="mb-card"><h2>그래픽을 시작하지 못했어요</h2><p class="mb-lead">WebGL 을 사용할 수 없습니다. 새로고침하거나 그래픽 가속을 켠 뒤 다시 시도해 주세요.</p><div class="mb-actions"><button class="primary" data-act="back">돌아가기</button></div></div>'); return; }
    ended = false; paused = false; acc = 0; free = false; aimIdx = -1; amove = false; skillKey = itemKey = ''; floats.length = 0; feed.length = 0; hide(); root.dataset.phase = 'play'; resize(); last = performance.now();
    say(`${LANE_NAME[lane]}에서 시작합니다. 우클릭으로 이동, QWER 로 스킬!`); const m = sim.me(); view.lookAt(m.x, m.y);
    // 처음에는 상점에서 장비를 사도록 안내
    window.setTimeout(() => { if (sim && !ended && sim.tick < 400) hint('기지에서 P 로 상점을 열어 아이템을 사고, 미니언 웨이브를 따라 라인으로 가세요. 레벨업마다 스킬 포인트가 생겨요 (Ctrl+Q/W/E/R)'); window.setTimeout(() => hint(''), 9000); }, 600);
  }
  function finish(): void {
    if (!sim || ended) return; ended = true; root.dataset.phase = 'over'; const win = sim.winner === 0; audio.sfx(win ? 'victory' : 'defeat');
    window.setTimeout(() => { if (closed || !sim) return; const h = sim.me().hero!, t = sim.teams;
      show(`<div class="mb-card mb-result ${win ? 'win' : 'lose'}"><span class="mb-eyebrow">${LEVELS[level].label} · ${clock(sim.tick)}</span><h2>${win ? '승리' : '패배'}</h2><p class="mb-lead">${win ? '적 넥서스를 파괴했습니다.' : '우리 넥서스가 무너졌습니다.'}</p>
        <dl class="mb-stats"><div><dt>K/D/A</dt><dd>${h.kills}/${h.deaths}/${h.assists}</dd></div><div><dt>미니언</dt><dd>${h.cs}</dd></div><div><dt>레벨</dt><dd>${h.level}</dd></div><div><dt>팀 킬</dt><dd>${t[0].kills}:${t[1].kills}</dd></div></dl>
        <div class="mb-actions"><button class="primary" data-act="again">다시 하기</button><button data-act="setup">챔피언 선택</button><button data-act="back">RTS 로</button></div></div>`, 'result'); }, 1500);
  }

  // ---------- 루프 ----------
  function resize(): void { const w = root.clientWidth, h = root.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2); over.width = Math.round(w * dpr); over.height = Math.round(h * dpr); view?.resize(w, h, root.dataset.phase === 'setup' ? 0 : Math.round($('.mb-bottom').offsetHeight * 0.55)); }
  const ro = new ResizeObserver(resize); ro.observe(root);
  function frame(now: number): void {
    raf = requestAnimationFrame(frame); const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!sim || !view || root.dataset.phase === 'setup') return;
    if (annT > 0 && (annT -= dt) <= 0) $('#mb-ann').classList.remove('show');
    if (!ended && !paused) {
      acc += dt; let n = 0; while (acc >= 1 / TICK && n < 6 && sim.winner === -1) { sim.step(); for (const a of ais) a.think(sim); acc -= 1 / TICK; n++; } if (acc > 0.5) acc = 0;
      if (sim.winner !== -1) finish();
    }
    const m = sim.me(); const ev = sim.drain(); view.consume(ev, 0);
    for (const e of ev) {
      if (e.t === 'dmg') { if (floats.length < 40) floats.push({ x: e.x, y: e.y, amt: e.amt, t: 0, team: e.team, id: e.id }); }
      else if (e.t === 'announce') { say(e.text, e.team === 1); feed.push({ text: e.text, t: performance.now() }); if (e.team === 1) audio.sfx('alert'); }
      else if (e.t === 'kill') { const k = sim.get(e.killer), v = sim.get(e.victim); feed.push({ text: `${k?.hero?.name ?? (k?.kind === 'turret' ? '포탑' : '미니언')} → ${v?.hero?.name ?? '챔피언'}`, t: performance.now() }); if (e.victim === m.id) say('쓰러졌습니다. 잠시 후 부활합니다', true); else if (e.killer === m.id) { say('처치!'); audio.sfx('built'); } }
      else if (e.t === 'die') audio.sfx(e.kind === 'turret' || e.kind === 'nexus' ? 'bigboom' : 'boom', Math.max(0.1, 1 - Math.hypot(e.x - m.x, e.y - m.y) / 40) * 0.6);
      else if (e.t === 'shot' && e.from === m.id) audio.sfx(e.ranged ? 'bullet' : 'click', 0.5);
      else if (e.t === 'level' && e.id === m.id) { say(`레벨 ${m.hero!.level}!`); audio.sfx('trained'); }
    }
    // 카메라: 영웅을 따라가다가 방향키·가장자리로 움직이면 자유 시점
    const sp = view.cam.dist * 1.1 * dt; let dx = 0, dy = 0; if (keys.has('ArrowLeft')) dx -= 1; if (keys.has('ArrowRight')) dx += 1; if (keys.has('ArrowUp')) dy -= 1; if (keys.has('ArrowDown')) dy += 1;
    if (!touch && pointer.in && root.dataset.phase === 'play' && !modal.classList.contains('show')) { const mg2 = 10, w = over.clientWidth, h = over.clientHeight; if (pointer.x < mg2) dx -= 1; if (pointer.x > w - mg2) dx += 1; if (pointer.y < mg2) dy -= 1; if (pointer.y > h - mg2 * 2) dy += 1; }
    if ((dx || dy) && !paused) { free = true; view.pan(dx * sp, dy * sp); }
    if (!free || keys.has('Space')) { const k = Math.min(1, dt * 6); view.lookAt(view.cam.x + (m.x - view.cam.x) * k, view.cam.y + (m.y - view.cam.y) * k); }
    // 스킬 조준선
    if (aimIdx >= 0 && !m.hero!.dead) { const k = sim.skill(m, aimIdx), g = pointer.in ? view.ground(pointer.x, pointer.y) : null, tgt = g ?? { x: m.x + m.fx * 5, y: m.y + m.fy * 5 }; let ax = tgt.x, ay = tgt.y; const d = Math.hypot(ax - m.x, ay - m.y) || 1;
      if (k.kind === 'shot') { const len = Math.min(k.range, d); ax = m.x + (ax - m.x) / d * len; ay = m.y + (ay - m.y) / d * len; } else if (k.range > 0 && d > k.range) { ax = m.x + (ax - m.x) / d * k.range; ay = m.y + (ay - m.y) / d * k.range; }
      view.setAim({ x: k.range === 0 ? m.x : ax, y: k.range === 0 ? m.y : ay, r: k.radius ?? (k.kind === 'shot' ? 0.6 : 0.9), range: k.range, from: m, color: 0xffe9a0 }); over.style.cursor = 'crosshair'; } else { view.setAim(null); over.style.cursor = amove ? 'crosshair' : 'default'; }
    view.render(dt); uiT += dt; if (uiT > 0.1) { uiT = 0; paintHud(); drawMini(); } drawOverlay(dt);
  }

  // ---------- 버튼 ----------
  function exitAll(): void { if (closed) return; closed = true; cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); view?.dispose(); audio.dispose(); root.remove(); }
  root.addEventListener('click', e => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-champ],[data-lane],[data-level],[data-buy]'); if (!t) return; audio.unlock();
    if (t.dataset.champ) { champ = t.dataset.champ as ChampId; modal.querySelectorAll<HTMLElement>('[data-champ]').forEach(b => b.setAttribute('aria-pressed', String(b === t))); audio.sfx('select'); return; }
    if (t.dataset.lane) { lane = t.dataset.lane as Lane; modal.querySelectorAll<HTMLElement>('[data-lane]').forEach(b => b.setAttribute('aria-pressed', String(b === t))); audio.sfx('click'); return; }
    if (t.dataset.level) { level = t.dataset.level as Level; modal.querySelectorAll<HTMLElement>('[data-level]').forEach(b => b.setAttribute('aria-pressed', String(b === t))); $('#mb-levelnote').textContent = LEVELS[level].blurb; audio.sfx('click'); return; }
    if (t.dataset.buy) { if (t.getAttribute('aria-disabled') === 'true') { const m = me(); say(m && !(sim!.inBase(m) || m.hero!.dead) ? '기지에서만 살 수 있습니다' : '골드가 부족하거나 자리가 없습니다', true); return; } if (cmd({ k: 'buy', item: t.dataset.buy as ItemId })) { audio.sfx('place'); paintHud(); } return; }
    switch (t.dataset.act) {
      case 'start': case 'again': begin(); break;
      case 'setup': setupScreen(); break;
      case 'help': show(helpHtml('setup'), 'help'); break;
      case 'help2': show(helpHtml('openMenu'), 'help'); break;
      case 'openMenu': root.dataset.phase = 'play'; openMenu(); break;
      case 'resume': resume(); break;
      case 'closeModal': hide(); break;
      case 'surrender': hide(); paused = false; root.dataset.phase = 'play'; cmd({ k: 'surrender' }); break;
      case 'back': exitAll(); onBack(); break;
      case 'pause': if (root.dataset.phase === 'play') openMenu(); break;
      case 'board': if (root.dataset.phase === 'play') board(); break;
      case 'shop': if (root.dataset.phase === 'play') shop(); break;
      case 'recall': cmd({ k: 'recall' }); break;
      case 'center': free = false; break;
      case 'mute': { const s = !audio.enabled; audio.enabled = s; writePreferences({ ...readPreferences(), sound: s }); const b = root.querySelector<HTMLElement>('[data-act="mute"]'); if (b) { b.textContent = s ? '🔊' : '🔇'; b.setAttribute('aria-pressed', String(s)); } break; }
    }
  });
  if (import.meta.env.DEV) (window as unknown as { __moba: unknown }).__moba = { get sim() { return sim; }, get view() { return view; }, begin, cast, step: (n: number) => { for (let i = 0; i < n && sim; i++) { sim.step(); for (const a of ais) a.think(sim); } } };
  void NEXUS; void onExit;
  raf = requestAnimationFrame(frame); resize(); setupScreen();
}
