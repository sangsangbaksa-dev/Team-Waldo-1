// ZERO ZONE — 총기 조립 화면: 총을 3D 로 돌려 보며 조준경·총구·손잡이·탄창·개머리판을 끼우고, 능력치 변화를 바로 확인합니다.
// 만든 구성은 저장되어 솔로 배틀로열에서 내가 총을 주울 때마다 그대로 달립니다(AI와 온라인 상대는 해당 없음).
import * as THREE from 'three';
import { LOADOUT_BUDGET, PARTS, PART_FITS, PART_SLOTS, SLOT_NAMES, WEAPONS, WEAPON_IDS, attCost, gunStats, partsFor, type Attachments, type GunStats, type Loadout, type PartDef, type PartSlot, type WeaponId } from './config';
import { buildGun, slotPoint } from './gunbuild';
import type { ShooterAssets } from './assets';
import { loadoutCount, type SavedLoadout } from './loadout';

export interface GunsmithOptions { assets: ShooterAssets | null; saved: SavedLoadout; touch: boolean; onChange: (l: SavedLoadout) => void; onClose: () => void }

const esc = (s: string): string => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
const MINUS = '−';
const pct = (v: number): string => `${v < 1 ? MINUS : '+'}${Math.abs(Math.round((v - 1) * 100))}%`;

/** 추천 조합: 점수(LOADOUT_BUDGET) 안에서 성격이 다른 두 가지 */
const PRESETS: Record<WeaponId, Array<{ name: string; att: Attachments }>> = {
  pistol: [{ name: '소음 권총', att: { muzzle: 'suppressor', mag: 'extquick' } }, { name: '안정형', att: { muzzle: 'comp', mag: 'extmag' } }],
  smg: [{ name: '근접 제압', att: { sight: 'reddot', muzzle: 'comp', grip: 'angled', mag: 'extquick' } }, { name: '은밀 돌파', att: { sight: 'holo', muzzle: 'suppressor', mag: 'quickmag', stock: 'tactical' } }],
  rifle: [{ name: '안정형', att: { sight: 'holo', muzzle: 'comp', grip: 'grip', stock: 'tactical' } }, { name: '중장거리', att: { sight: 'scope4', muzzle: 'flash', mag: 'extmag', stock: 'tactical' } }],
  shotgun: [{ name: '돌격형', att: { sight: 'reddot', muzzle: 'comp', mag: 'extmag' } }, { name: '확장 튜브', att: { muzzle: 'flash', mag: 'extmag' } }],
  sniper: [{ name: '초장거리', att: { sight: 'scope8', muzzle: 'suppressor', stock: 'cheek' } }, { name: '연사 저격', att: { sight: 'scope4', muzzle: 'flash', mag: 'extmag', stock: 'cheek' } }],
};
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

export function openGunsmith(host: HTMLElement, o: GunsmithOptions): () => void {
  const saved: SavedLoadout = { on: o.saved.on, guns: { ...o.saved.guns }, last: o.saved.last };
  let weapon: WeaponId = saved.last, slot: PartSlot | null = null, zoomed = false, tab: 'parts' | 'stats' = 'parts', closed = false;
  const root = document.createElement('div'); root.className = 'gs-root' + (o.touch ? ' touch' : ''); root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', '총기 조립');
  root.innerHTML = `
    <header class="gs-head"><div><span class="gs-eyebrow">ZERO ZONE</span><h2>총기 조립</h2></div><div class="gs-budget" id="gs-budget"></div><button type="button" class="gs-done" data-act="close">완료</button></header>
    <nav class="gs-weapons" id="gs-weapons" aria-label="무기 선택"></nav>
    <aside class="gs-statscol"><div class="gs-panel gs-stats" id="gs-stats"></div></aside>
    <section class="gs-stage" id="gs-stage"><canvas id="gs-canvas" aria-label="총기 3D 미리보기"></canvas><div class="gs-hots" id="gs-hots"></div><div class="gs-hint" id="gs-hint">끌어서 돌려 보세요</div><div class="gs-presets" id="gs-presets"></div><div class="gs-nogl" id="gs-nogl" hidden>3D 모델을 불러오지 못했습니다. 능력치는 그대로 확인할 수 있습니다.</div></section>
    <div class="gs-tabs" role="tablist"><button type="button" role="tab" data-tab="parts">파츠</button><button type="button" role="tab" data-tab="stats">능력치</button></div>
    <aside class="gs-partscol"><div class="gs-panel gs-parts" id="gs-parts"></div></aside>
    <footer class="gs-foot"><label class="gs-switch"><input type="checkbox" id="gs-on"><i></i><span><b>경기에서 내 조립 사용</b><em>솔로 배틀로열에서 총을 주울 때 이 파츠가 함께 달립니다</em></span></label><button type="button" data-act="reset">이 총 초기화</button></footer>`;
  host.append(root);
  const q = <T extends HTMLElement>(sel: string): T => root.querySelector<T>(sel)!;
  const canvas = q<HTMLCanvasElement>('#gs-canvas'), stage = q('#gs-stage'), hotsEl = q('#gs-hots'), nodes = o.assets?.weaponNodes ?? null;

  const att = (): Attachments => saved.guns[weapon] ?? {};
  const commit = (): void => { saved.last = weapon; o.onChange({ on: saved.on, guns: { ...saved.guns }, last: weapon }); };

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
    // 받침대: 어두운 원판과 가는 고리
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.03, 48), new THREE.MeshLambertMaterial({ color: 0x1b1f25 })); plate.position.y = -0.34; scene.add(plate);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.68, 0.7, 64), new THREE.MeshBasicMaterial({ color: 0xf0b44c, transparent: true, opacity: 0.7, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = -0.32; scene.add(ring);
  }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let baseYaw = -0.38, sway = reduce ? 0 : 0.3, dist = 2, tDist = 2, fit = 2; const look = new THREE.Vector3(), tLook = new THREE.Vector3(), size = new THREE.Vector3();
  function rebuild(): void {
    holder.clear(); if (!nodes) return;
    const g = buildGun(nodes, weapon, att(), false); holder.add(g); holder.position.set(0, 0, 0); holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g); box.getCenter(center); box.getSize(size); holder.position.copy(center).negate();
    const aspect = Math.max(0.5, stage.clientWidth / Math.max(1, stage.clientHeight)), vf = THREE.MathUtils.degToRad(camera.fov) / 2;
    fit = Math.max(((size.x * 0.9 + size.z * 0.5) * 0.44) / (Math.tan(vf) * aspect), (size.y * 1.9) / Math.tan(vf)) + 0.15; focus();
  }
  function focus(): void { tDist = zoomed && slot && PART_FITS[weapon].includes(slot) ? fit * 0.62 : fit; }
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
  function paintWeapons(): void {
    q('#gs-weapons').innerHTML = WEAPON_IDS.map(id => { const n = Object.keys(saved.guns[id] ?? {}).length; return `<button type="button" class="${id === weapon ? 'on' : ''}" data-w="${id}" aria-pressed="${id === weapon}"><b>${WEAPONS[id].name}</b><small>${n ? `파츠 ${n}개` : '기본'}</small></button>`; }).join('');
  }
  function paintBudget(): void {
    const c = attCost(att()); q('#gs-budget').innerHTML = `<span>파츠 점수</span><b>${c}<em> / ${LOADOUT_BUDGET}</em></b><i>${Array.from({ length: LOADOUT_BUDGET }, (_, k) => `<u class="${k < c ? 'on' : ''}"></u>`).join('')}</i>`;
  }
  function paintHots(): void {
    hotsEl.innerHTML = PART_SLOTS.filter(s => PART_FITS[weapon].includes(s)).map(s => { const p = att()[s]; return `<button type="button" class="gs-hot ${s} ${zoomed && s === slot ? 'on' : ''} ${p ? 'has' : ''}" data-slot="${s}" aria-label="${SLOT_NAMES[s]}: ${p ? PARTS[p].name : '비어 있음'}"><i></i><span><small>${SLOT_NAMES[s]}</small>${p ? esc(PARTS[p].name) : ''}</span></button>`; }).join('');
  }
  function paintPresets(): void {
    q('#gs-presets').innerHTML = `<span>추천</span>${PRESETS[weapon].map((p, i) => `<button type="button" data-preset="${i}">${esc(p.name)}</button>`).join('')}`;
  }
  function paintStats(): void {
    const base = gunStats(weapon, {}), cur = gunStats(weapon, att());
    q('#gs-stats').innerHTML = `<h3>${WEAPONS[weapon].name} 능력치</h3>` + ROWS.map(r => {
      const a = r.score(base, weapon), b = r.score(cur, weapon), d = r.delta(base, cur), good = b >= a;
      return `<div class="gs-row"><span>${r.label}</span><div class="gs-bar"><i class="base" style="width:${(Math.min(a, b) * 100).toFixed(1)}%"></i>${b > a + 0.001 ? `<i class="up" style="left:${(a * 100).toFixed(1)}%;width:${((b - a) * 100).toFixed(1)}%"></i>` : ''}${b < a - 0.001 ? `<i class="down" style="left:${(b * 100).toFixed(1)}%;width:${((a - b) * 100).toFixed(1)}%"></i>` : ''}</div><b>${r.text(cur, weapon)}</b><em class="${d ? (good ? 'good' : 'bad') : ''}">${d}</em></div>`;
    }).join('');
  }
  function paintParts(): void {
    const tabs = PART_SLOTS.filter(s => PART_FITS[weapon].includes(s));
    if (!slot || !tabs.includes(slot)) slot = tabs[0];
    const cur = att()[slot], others = attCost(att()) - (cur ? PARTS[cur].cost : 0);
    const opts = [`<button type="button" class="gs-opt ${!cur ? 'on' : ''}" data-part="" aria-pressed="${!cur}"><b>${NONE_NAME[slot]}</b><small>${slot === 'sight' && weapon === 'sniper' ? '기본 장착 4배율 스코프' : '추가 파츠 없음'}</small><span class="gs-cost">0</span></button>`];
    for (const p of partsFor(weapon, slot)) {
      const lock = others + p.cost > LOADOUT_BUDGET, on = cur === p.id;
      opts.push(`<button type="button" class="gs-opt ${on ? 'on' : ''}" data-part="${p.id}" aria-pressed="${on}" ${lock && !on ? 'disabled' : ''}><b>${esc(p.name)}</b><small>${esc(p.blurb)}</small><span class="gs-chips">${modChips(p).map(c => `<u class="${c.good ? 'good' : 'bad'}">${c.t}</u>`).join('')}</span><span class="gs-cost">${lock && !on ? '점수 부족' : p.cost}</span></button>`);
    }
    q('#gs-parts').innerHTML = `<div class="gs-slots">${tabs.map(s => `<button type="button" data-slot="${s}" class="${s === slot ? 'on' : ''}" aria-pressed="${s === slot}"><small>${SLOT_NAMES[s]}</small><b>${att()[s] ? esc(PARTS[att()[s]!].name.replace(' 조준경', '').replace(' 사이트', '').replace(' 탄창', '탄창')) : '—'}</b></button>`).join('')}</div><div class="gs-opts">${opts.join('')}</div>`;
  }
  function paintAll(rebuildGun = true): void {
    paintWeapons(); paintBudget(); paintStats(); paintParts(); paintHots(); paintPresets(); q<HTMLInputElement>('#gs-on').checked = saved.on;
    root.dataset.view = tab; root.querySelectorAll<HTMLElement>('.gs-tabs button').forEach(b => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
    if (rebuildGun) rebuild(); else focus();
  }
  function setPart(part: string): void {
    if (!slot) return; const a: Attachments = { ...att() }; if (part) a[slot] = part as never; else delete a[slot];
    if (Object.keys(a).length) saved.guns[weapon] = a; else delete saved.guns[weapon];
    commit(); paintAll();
  }
  root.addEventListener('click', e => {
    const t = e.target as HTMLElement, w = t.closest<HTMLElement>('[data-w]'), s = t.closest<HTMLElement>('[data-slot]'), p = t.closest<HTMLElement>('[data-part]'), act = t.closest<HTMLElement>('[data-act]'), tb = t.closest<HTMLElement>('[data-tab]'), pr = t.closest<HTMLElement>('[data-preset]');
    if (w) { weapon = w.dataset.w as WeaponId; slot = null; zoomed = false; sway = reduce ? 0 : 0.3; commit(); paintAll(); }
    else if (pr) { saved.guns[weapon] = { ...PRESETS[weapon][Number(pr.dataset.preset)].att }; commit(); paintAll(); }
    else if (p && !(p as HTMLButtonElement).disabled) setPart(p.dataset.part ?? '');
    else if (s) { const next = s.dataset.slot as PartSlot; zoomed = !(zoomed && slot === next); slot = next; if (tab !== 'parts') tab = 'parts'; paintAll(false); }
    else if (tb) { tab = tb.dataset.tab as 'parts' | 'stats'; paintAll(false); }
    else if (act?.dataset.act === 'reset') { delete saved.guns[weapon]; commit(); paintAll(); }
    else if (act?.dataset.act === 'close') close();
  });
  q<HTMLInputElement>('#gs-on').addEventListener('change', e => { saved.on = (e.target as HTMLInputElement).checked; commit(); });
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { const i = WEAPON_IDS.indexOf(weapon), n = WEAPON_IDS.length; weapon = WEAPON_IDS[(i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n]; slot = null; zoomed = false; commit(); paintAll(); e.preventDefault(); }
  };
  document.addEventListener('keydown', onKey, true);

  // ---------- 매 프레임 ----------
  let raf = 0, last = performance.now(), t = 0; const v = new THREE.Vector3();
  function frame(now: number): void {
    if (closed) return; raf = requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    pivot.rotation.y = baseYaw + Math.sin(t * 0.5) * sway; pivot.rotation.x = 0; pivot.updateMatrixWorld(true);
    if (zoomed && slot && PART_FITS[weapon].includes(slot)) { v.copy(slotPoint(weapon, slot)); holder.localToWorld(v); tLook.copy(v).multiplyScalar(0.75); } else tLook.set(0, 0, 0);
    const k = 1 - Math.exp(-dt * 6); look.lerp(tLook, k); dist += (tDist - dist) * k;
    camera.position.set(look.x, look.y + dist * 0.14, look.z + dist); camera.lookAt(look);
    camera.updateMatrixWorld(true); pivot.updateMatrixWorld(true);
    const w = stage.clientWidth, h = stage.clientHeight;
    for (const el of hotsEl.querySelectorAll<HTMLElement>('.gs-hot')) {
      v.copy(slotPoint(weapon, el.dataset.slot as PartSlot)); holder.localToWorld(v); v.project(camera);
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h, m = 6; el.style.transform = `translate(${Math.max(m, Math.min(w - m, x)).toFixed(1)}px,${Math.max(m, Math.min(h - m, y)).toFixed(1)}px)`; el.style.opacity = v.z < 1 ? '1' : '0';
    }
    renderer?.render(scene, camera);
  }
  function close(): void {
    if (closed) return; closed = true; cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('keydown', onKey, true);
    holder.clear(); renderer?.dispose(); root.remove(); o.onClose();
  }
  paintAll(false); resize(); raf = requestAnimationFrame(frame);
  (root.querySelector<HTMLElement>('.gs-done'))?.focus({ preventScroll: true });
  return close;
}

/** 요약 문구: 출격 설정 화면에서 씁니다 */
export function loadoutSummary(l: SavedLoadout): string {
  const n = loadoutCount(l.guns); return n ? `${n}자루 구성 · ${l.on ? '경기에 적용' : '꺼짐'}` : '아직 구성이 없습니다';
}
export type { Loadout };
