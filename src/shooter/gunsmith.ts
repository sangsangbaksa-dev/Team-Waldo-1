// ZERO ZONE — 경기 중 총기 조립 화면(L): 지금 가방에 있는 파츠만으로 들고 있는 총을 조립합니다. 총을 3D 로 돌려 보며 능력치 변화를 바로 확인합니다.
// 파츠는 경기 중에 줍는 것이라 영구 보관·영구 강화는 없습니다. 달린 파츠를 빼면 가방으로 돌아옵니다.
import * as THREE from 'three';
import { BAG_MAX, PARTS, PART_FITS, PART_SLOTS, SLOT_NAMES, WEAPONS, canFit, gunStats, partsFor, type GunStats, type PartDef, type PartId, type PartSlot, type WeaponId } from './config';
import { buildGun, slotPoint } from './gunbuild';
import type { ShooterAssets } from './assets';
import type { Player } from './sim';

export interface GunsmithOptions {
  assets: ShooterAssets | null; touch: boolean;
  /** 지금 내 선수(가방과 총은 매번 여기서 읽습니다) */ me: () => Player;
  /** 조립 요청: 성공하면 true */ equip: (gunIdx: number, slot: PartSlot, part: PartId | null) => boolean;
  /** 온라인 경기처럼 조립하는 동안에도 시간이 흐르는지 */ live: boolean; onClose: () => void;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
const MINUS = '−';
const pct = (v: number): string => `${v < 1 ? MINUS : '+'}${Math.abs(Math.round((v - 1) * 100))}%`;
const NONE_NAME: Record<PartSlot, string> = { sight: '기본 조준', muzzle: '총구 장치 없음', grip: '손잡이 없음', mag: '기본 탄창', stock: '기본 개머리판' };

interface Row { key: string; label: string; score: (s: GunStats, w: WeaponId) => number; text: (s: GunStats, w: WeaponId) => string; delta: (a: GunStats, b: GunStats) => string }
const sgn = (n: number, unit = ''): string => (n === 0 ? '' : `${n > 0 ? '+' : MINUS}${Math.abs(n)}${unit}`);
const ROWS: Row[] = [
  { key: 'dmg', label: '위력', score: s => Math.min(1, s.dmg / 100), text: (s, w) => (WEAPONS[w].pellets > 1 ? `${WEAPONS[w].dmg}×${WEAPONS[w].pellets}` : String(s.dmg)), delta: () => '' },
  { key: 'rpm', label: '연사력', score: s => Math.min(1, s.rpm / 800), text: s => `${Math.round(s.rpm)}`, delta: () => '' },
  { key: 'range', label: '사거리', score: s => Math.min(1, s.range / 500), text: s => `${s.range}m`, delta: () => '' },
  { key: 'kick', label: '반동 제어', score: s => Math.max(0, 1 - s.kick / 0.11), text: s => `${Math.round(Math.max(0, 1 - s.kick / 0.11) * 100)}`, delta: (a, b) => sgn(Math.round((Math.max(0, 1 - b.kick / 0.11) - Math.max(0, 1 - a.kick / 0.11)) * 100)) },
  { key: 'ads', label: '조준 정확도', score: s => Math.max(0, 1 - s.ads / 0.035), text: s => `${Math.round(Math.max(0, 1 - s.ads / 0.035) * 100)}`, delta: (a, b) => sgn(Math.round((Math.max(0, 1 - b.ads / 0.035) - Math.max(0, 1 - a.ads / 0.035)) * 100)) },
  { key: 'mag', label: '탄창', score: s => Math.min(1, s.mag / 45), text: s => `${s.mag}발`, delta: (a, b) => sgn(b.mag - a.mag) },
  { key: 'reload', label: '장전', score: s => Math.max(0, 1 - s.reload / 3), text: s => `${s.reload.toFixed(1)}초`, delta: (a, b) => (Math.abs(b.reload - a.reload) < 0.05 ? '' : `${b.reload < a.reload ? MINUS : '+'}${Math.abs(b.reload - a.reload).toFixed(1)}초`) },
  { key: 'zoom', label: '배율', score: s => Math.min(1, (s.zoom - 1) / 7), text: s => `×${s.zoom % 1 ? s.zoom.toFixed(2).replace(/0$/, '') : s.zoom}`, delta: () => '' },
];

function modChips(p: PartDef): Array<{ t: string; good: boolean }> {
  const out: Array<{ t: string; good: boolean }> = [], m = p.mod;
  if (p.slot === 'sight') out.push({ t: `${p.zoom % 1 ? p.zoom.toFixed(2).replace(/0$/, '') : p.zoom}배`, good: true });
  if (m.kick) out.push({ t: `반동 ${pct(m.kick)}`, good: m.kick < 1 });
  if (m.spread) out.push({ t: `퍼짐 ${pct(m.spread)}`, good: m.spread < 1 });
  if (m.ads) out.push({ t: `조준 ${pct(m.ads)}`, good: m.ads < 1 });
  if (m.reload) out.push({ t: `장전 ${pct(m.reload)}`, good: m.reload < 1 });
  if (m.mag) out.push({ t: `탄창 ${pct(m.mag)}`, good: m.mag > 1 });
  return out;
}

/** 가방 안의 파츠를 종류별로 센 표 */
export function bagCounts(parts: readonly PartId[]): Map<PartId, number> { const m = new Map<PartId, number>(); for (const p of parts) m.set(p, (m.get(p) ?? 0) + 1); return m; }

/** 이 총의 이 칸에 가방에서 끼울 수 있는 파츠(가방에 든 것만) */
export function ownedFor(weapon: WeaponId, slot: PartSlot, parts: readonly PartId[]): PartDef[] {
  const have = bagCounts(parts); return partsFor(weapon, slot).filter(d => (have.get(d.id) ?? 0) > 0);
}

export function openGunsmith(host: HTMLElement, o: GunsmithOptions): () => void {
  let gunIdx = Math.max(0, o.me().cur), slot: PartSlot | null = null, zoomed = false, tab: 'parts' | 'stats' = 'parts', closed = false;
  if (!o.me().guns[gunIdx]) gunIdx = o.me().guns[0] ? 0 : 1;
  const root = document.createElement('div'); root.className = 'gs-root' + (o.touch ? ' touch' : '') + (o.live ? ' live' : ''); root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', '총기 조립');
  root.innerHTML = `
    <header class="gs-head"><div><span class="gs-eyebrow">ZERO ZONE</span><h2>총기 조립</h2></div><div class="gs-bag" id="gs-bag"></div><button type="button" class="gs-done" data-act="close">완료${o.touch ? '' : ' <small>L</small>'}</button></header>
    <nav class="gs-weapons" id="gs-weapons" aria-label="들고 있는 총"></nav>
    <aside class="gs-statscol"><div class="gs-panel gs-stats" id="gs-stats"></div></aside>
    <section class="gs-stage" id="gs-stage"><canvas id="gs-canvas" aria-label="총기 3D 미리보기"></canvas><div class="gs-hots" id="gs-hots"></div><div class="gs-hint" id="gs-hint">끌어서 돌려 보세요</div><div class="gs-nogl" id="gs-nogl" hidden>3D 모델을 불러오지 못했습니다. 능력치는 그대로 확인할 수 있습니다.</div></section>
    <div class="gs-tabs" role="tablist"><button type="button" role="tab" data-tab="parts">파츠</button><button type="button" role="tab" data-tab="stats">능력치</button></div>
    <aside class="gs-partscol"><div class="gs-panel gs-parts" id="gs-parts"></div></aside>
    <footer class="gs-foot"><p id="gs-note">${o.live ? '<b>경기는 계속됩니다.</b> 조립하는 동안 움직일 수 없으니 안전한 곳에서 하세요.' : '<b>경기가 멈춰 있습니다.</b> 파츠는 이번 경기에서 주운 것만 쓸 수 있습니다.'}</p><button type="button" data-act="close">경기로 돌아가기</button></footer>`;
  host.append(root);
  const q = <T extends HTMLElement>(sel: string): T => root.querySelector<T>(sel)!;
  const canvas = q<HTMLCanvasElement>('#gs-canvas'), stage = q('#gs-stage'), hotsEl = q('#gs-hots'), nodes = o.assets?.weaponNodes ?? null;

  const gun = () => o.me().guns[gunIdx] ?? null;
  const weapon = (): WeaponId | null => gun()?.id ?? null;
  const att = () => gun()?.att ?? {};

  // ---------- 3D ----------
  let renderer: THREE.WebGLRenderer | null = null;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(26, 1, 0.05, 30), pivot = new THREE.Group(), holder = new THREE.Group(), center = new THREE.Vector3();
  scene.add(pivot); pivot.add(holder);
  let nogl = !nodes;
  if (nodes) {
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); } catch { nogl = true; }
  }
  q('#gs-nogl').hidden = !nogl;
  if (renderer) {
    renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    scene.add(new THREE.HemisphereLight(0xe3ecff, 0x2c2a28, 1.7));
    const key = new THREE.DirectionalLight(0xfff0da, 2.8); key.position.set(1.5, 2.6, 2.4); scene.add(key);
    const rim = new THREE.DirectionalLight(0x78aaff, 1.6); rim.position.set(-2.4, 1.2, -2); scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffb070, 0.7); fill.position.set(-1.5, -0.5, 2); scene.add(fill);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.03, 48), new THREE.MeshLambertMaterial({ color: 0x1b1f25 })); plate.position.y = -0.34; scene.add(plate);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.68, 0.7, 64), new THREE.MeshBasicMaterial({ color: 0xf0b44c, transparent: true, opacity: 0.7, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = -0.32; scene.add(ring);
  }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let baseYaw = -0.38, sway = reduce ? 0 : 0.3, dist = 2, tDist = 2, fit = 2; const look = new THREE.Vector3(), tLook = new THREE.Vector3(), size = new THREE.Vector3();
  function rebuild(): void {
    holder.clear(); const w = weapon(); if (!nodes || !w) return;
    const g = buildGun(nodes, w, att(), false); holder.add(g); holder.position.set(0, 0, 0); holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g); box.getCenter(center); box.getSize(size); holder.position.copy(center).negate();
    const aspect = Math.max(0.5, stage.clientWidth / Math.max(1, stage.clientHeight)), vf = THREE.MathUtils.degToRad(camera.fov) / 2;
    fit = Math.max(((size.x * 0.9 + size.z * 0.5) * 0.44) / (Math.tan(vf) * aspect), (size.y * 1.9) / Math.tan(vf)) + 0.15; focus();
  }
  function focus(): void { const w = weapon(); tDist = zoomed && slot && w && PART_FITS[w].includes(slot) ? fit * 0.62 : fit; }
  function resize(): void {
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return; camera.aspect = w / h; camera.updateProjectionMatrix();
    if (renderer) { renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(w, h, false); } rebuild();
  }
  const ro = new ResizeObserver(resize); ro.observe(stage);

  // 끌어서 돌리기
  let drag: { x: number; yaw: number; id: number } | null = null;
  stage.addEventListener('pointerdown', e => { if ((e.target as HTMLElement).closest('button')) return; drag = { x: e.clientX, yaw: baseYaw, id: e.pointerId }; stage.setPointerCapture(e.pointerId); sway = 0; q('#gs-hint').classList.add('off'); });
  stage.addEventListener('pointermove', e => { if (drag && e.pointerId === drag.id) baseYaw = drag.yaw + (e.clientX - drag.x) * 0.012; });
  const endDrag = (e: PointerEvent): void => { if (drag && e.pointerId === drag.id) drag = null; };
  stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);

  // ---------- 화면 ----------
  const slotsOf = (w: WeaponId): PartSlot[] => PART_SLOTS.filter(s => PART_FITS[w].includes(s));
  function paintWeapons(): void {
    const me = o.me();
    q('#gs-weapons').innerHTML = me.guns.map((g, i) => {
      if (!g) return `<button type="button" disabled><b>${i + 1} 비어 있음</b><small>—</small></button>`;
      const n = Object.keys(g.att).length; return `<button type="button" class="${i === gunIdx ? 'on' : ''}" data-w="${i}" aria-pressed="${i === gunIdx}"><b>${i + 1} ${WEAPONS[g.id].name}</b><small>${n ? `파츠 ${n}개` : '기본'}${i === me.cur ? ' · 들고 있음' : ''}</small></button>`;
    }).join('');
  }
  function paintBag(): void {
    const n = o.me().parts.length; q('#gs-bag').innerHTML = `<span>가방 파츠</span><b>${n}<em> / ${BAG_MAX}</em></b>`;
  }
  function paintHots(): void {
    const w = weapon(); if (!w) { hotsEl.innerHTML = ''; return; }
    hotsEl.innerHTML = slotsOf(w).map(s => { const p = att()[s]; return `<button type="button" class="gs-hot ${s} ${zoomed && s === slot ? 'on' : ''} ${p ? 'has' : ''}" data-slot="${s}" aria-label="${SLOT_NAMES[s]}: ${p ? PARTS[p].name : '비어 있음'}"><i></i><span><small>${SLOT_NAMES[s]}</small>${p ? esc(PARTS[p].name) : ''}</span></button>`; }).join('');
  }
  function paintStats(): void {
    const w = weapon(); if (!w) { q('#gs-stats').innerHTML = ''; return; }
    const base = gunStats(w, {}), cur = gunStats(w, att());
    q('#gs-stats').innerHTML = `<h3>${WEAPONS[w].name} 능력치</h3>` + ROWS.map(r => {
      const a = r.score(base, w), b = r.score(cur, w), d = r.delta(base, cur), good = b >= a;
      return `<div class="gs-row"><span>${r.label}</span><div class="gs-bar"><i class="base" style="width:${(Math.min(a, b) * 100).toFixed(1)}%"></i>${b > a + 0.001 ? `<i class="up" style="left:${(a * 100).toFixed(1)}%;width:${((b - a) * 100).toFixed(1)}%"></i>` : ''}${b < a - 0.001 ? `<i class="down" style="left:${(b * 100).toFixed(1)}%;width:${((a - b) * 100).toFixed(1)}%"></i>` : ''}</div><b>${r.text(cur, w)}</b><em class="${d ? (good ? 'good' : 'bad') : ''}">${d}</em></div>`;
    }).join('');
  }
  function paintParts(): void {
    const w = weapon(); if (!w) { q('#gs-parts').innerHTML = '<p class="gs-empty">이 칸에는 총이 없습니다.</p>'; return; }
    const tabs = slotsOf(w); if (!slot || !tabs.includes(slot)) slot = tabs[0];
    const cur = att()[slot], have = bagCounts(o.me().parts), owned = ownedFor(w, slot, o.me().parts);
    const opts = [`<button type="button" class="gs-opt ${!cur ? 'on' : ''}" data-part="" aria-pressed="${!cur}" ${cur && o.me().parts.length >= BAG_MAX ? 'disabled' : ''}><b>${NONE_NAME[slot]}</b><small>${cur ? '끼운 파츠를 빼서 가방에 넣습니다' : slot === 'sight' && w === 'sniper' ? '기본 장착 4배율 스코프' : '추가 파츠 없음'}</small></button>`];
    if (cur) opts.push(`<button type="button" class="gs-opt on" data-part="${cur}" aria-pressed="true" disabled><b>${esc(PARTS[cur].name)}</b><small>${esc(PARTS[cur].blurb)}</small><span class="gs-chips">${modChips(PARTS[cur]).map(c => `<u class="${c.good ? 'good' : 'bad'}">${c.t}</u>`).join('')}</span><span class="gs-cost">장착 중</span></button>`);
    for (const p of owned) {
      if (p.id === cur && (have.get(p.id) ?? 0) < 1) continue;
      opts.push(`<button type="button" class="gs-opt" data-part="${p.id}" aria-pressed="false"><b>${esc(p.name)}</b><small>${esc(p.blurb)}</small><span class="gs-chips">${modChips(p).map(c => `<u class="${c.good ? 'good' : 'bad'}">${c.t}</u>`).join('')}</span><span class="gs-cost">×${have.get(p.id)}</span></button>`);
    }
    const missing = !owned.length ? `<p class="gs-empty">이 칸에 맞는 ${SLOT_NAMES[slot]} 파츠가 가방에 없습니다.<br>지도에서 파츠를 주우면 여기서 끼울 수 있습니다.</p>` : '';
    q('#gs-parts').innerHTML = `<div class="gs-slots">${tabs.map(s => `<button type="button" data-slot="${s}" class="${s === slot ? 'on' : ''}" aria-pressed="${s === slot}"><small>${SLOT_NAMES[s]}</small><b>${att()[s] ? esc(PARTS[att()[s]!].name.replace(' 조준경', '').replace(' 사이트', '').replace(' 탄창', '탄창')) : '—'}</b></button>`).join('')}</div><div class="gs-opts">${opts.join('')}${missing}</div>`;
  }
  let sig = '';
  const signature = (): string => { const me = o.me(); return `${gunIdx}|${me.cur}|${me.parts.join(',')}|${me.guns.map(g => (g ? g.id + JSON.stringify(g.att) : '-')).join(';')}`; };
  function paintAll(rebuildGun = true): void {
    sig = signature(); paintWeapons(); paintBag(); paintStats(); paintParts(); paintHots();
    root.dataset.view = tab; root.querySelectorAll<HTMLElement>('.gs-tabs button').forEach(b => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
    if (rebuildGun) rebuild(); else focus();
  }
  function setPart(part: string): void {
    const w = weapon(); if (!slot || !w) return;
    if (o.equip(gunIdx, slot, part ? (part as PartId) : null)) paintAll(); else paintAll(false);
  }
  root.addEventListener('click', e => {
    const t = e.target as HTMLElement, w = t.closest<HTMLElement>('[data-w]'), s = t.closest<HTMLElement>('[data-slot]'), p = t.closest<HTMLElement>('[data-part]'), act = t.closest<HTMLElement>('[data-act]'), tb = t.closest<HTMLElement>('[data-tab]');
    if (w) { gunIdx = Number(w.dataset.w); slot = null; zoomed = false; sway = reduce ? 0 : 0.3; paintAll(); }
    else if (p && !(p as HTMLButtonElement).disabled) setPart(p.dataset.part ?? '');
    else if (s) { const next = s.dataset.slot as PartSlot; zoomed = !(zoomed && slot === next); slot = next; if (tab !== 'parts') tab = 'parts'; paintAll(false); }
    else if (tb) { tab = tb.dataset.tab as 'parts' | 'stats'; paintAll(false); }
    else if (act?.dataset.act === 'close') close();
  });
  const onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Escape' || e.code === 'KeyL') { e.preventDefault(); e.stopPropagation(); if (e.type === 'keydown' && !e.repeat) close(); return; }
    if (e.type !== 'keydown') return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.code === 'Digit1' || e.code === 'Digit2') {
      const me = o.me(), next = e.code === 'Digit1' ? 0 : e.code === 'Digit2' ? 1 : 1 - gunIdx; if (me.guns[next] && next !== gunIdx) { gunIdx = next; slot = null; zoomed = false; paintAll(); }
      e.preventDefault(); e.stopPropagation();
    }
  };
  document.addEventListener('keydown', onKey, true); document.addEventListener('keyup', onKey, true);

  // ---------- 매 프레임 ----------
  let raf = 0, last = performance.now(), t = 0; const v = new THREE.Vector3();
  function frame(now: number): void {
    if (closed) return; raf = requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    const me = o.me(); if (!me.alive || me.veh >= 0) { close(); return; }
    if (!me.guns[gunIdx]) { const other = me.guns[1 - gunIdx] ? 1 - gunIdx : -1; if (other < 0) { close(); return; } gunIdx = other; slot = null; zoomed = false; }
    if (signature() !== sig) paintAll(); // 경기 중에 파츠를 줍거나 총을 바꾸면 화면도 따라 바뀝니다.
    pivot.rotation.y = baseYaw + Math.sin(t * 0.5) * sway; pivot.rotation.x = 0; pivot.updateMatrixWorld(true);
    const w = weapon();
    if (zoomed && slot && w && PART_FITS[w].includes(slot)) { v.copy(slotPoint(w, slot)); holder.localToWorld(v); tLook.copy(v).multiplyScalar(0.75); } else tLook.set(0, 0, 0);
    const k = 1 - Math.exp(-dt * 6); look.lerp(tLook, k); dist += (tDist - dist) * k;
    camera.position.set(look.x, look.y + dist * 0.14, look.z + dist); camera.lookAt(look);
    camera.updateMatrixWorld(true); pivot.updateMatrixWorld(true);
    const cw = stage.clientWidth, ch = stage.clientHeight;
    if (w) for (const el of hotsEl.querySelectorAll<HTMLElement>('.gs-hot')) {
      v.copy(slotPoint(w, el.dataset.slot as PartSlot)); holder.localToWorld(v); v.project(camera);
      const x = (v.x * 0.5 + 0.5) * cw, y = (-v.y * 0.5 + 0.5) * ch, m = 6; el.style.transform = `translate(${Math.max(m, Math.min(cw - m, x)).toFixed(1)}px,${Math.max(m, Math.min(ch - m, y)).toFixed(1)}px)`; el.style.opacity = v.z < 1 ? '1' : '0';
    }
    renderer?.render(scene, camera);
  }
  function close(): void {
    if (closed) return; closed = true; cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('keydown', onKey, true); document.removeEventListener('keyup', onKey, true);
    holder.clear(); renderer?.dispose(); root.remove(); o.onClose();
  }
  paintAll(false); resize(); raf = requestAnimationFrame(frame);
  (root.querySelector<HTMLElement>('.gs-done'))?.focus({ preventScroll: true });
  return close;
}

/** 이 총에 이 파츠를 지금 끼울 수 있는가(가방에 있고 총에 맞는가) */
export function canEquipNow(p: Player, gunIdx: number, part: PartId): boolean { const g = p.guns[gunIdx]; return !!g && p.parts.includes(part) && canFit(g.id, part); }
