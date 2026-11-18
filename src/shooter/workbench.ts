import './workbench.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PARTS, PART_IDS, SLOTS, SLOT_NAMES, compatible, gunStats, type ModularGun, type PartId, type PartSlot } from './attachments';
import { WEAPONS } from './config';
import { disposeModel, makeModularGun, mountPoints, WEAPON_CODES } from './gunmodel';

interface BenchOptions { guns: Array<ModularGun | null>; bag: PartId[]; current: number; demo: boolean; live: boolean; equip(index: number, slot: PartSlot, part: PartId | null): boolean; close(): void }
const icons: Record<PartSlot, string> = {
  optic: '<path d="M12 28h40M20 28V14h22v14M24 14V9h14v5M28 28v7m7-7v7"/><circle cx="31" cy="21" r="4"/>',
  muzzle: '<path d="M8 21h8m0-7h34v15H16zm7 0v15m6-15v15m6-15v15m6-15v15m9-11h6v7h-6"/>',
  grip: '<path d="M14 12h37v7H14zm15 7-5 23h12l7-23M27 28h11m-13 6h11"/>',
  magazine: '<path d="M22 8h22v9l-4 26H17l5-26zm5 11-3 18m11-18-3 18M17 43h25"/>',
};
function icon(slot: PartSlot): string { return `<svg viewBox="0 0 64 48" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[slot]}</svg>`; }
export class WeaponBench {
  readonly root = document.createElement('section');
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(34, 1, 0.05, 100);
  private controls: OrbitControls;
  private model: THREE.Group | null = null;
  private slot: PartSlot = 'optic'; private index: number; private preview: PartId | null = null;
  private raf = 0; private observer: ResizeObserver; private disposed = false; private exploded = false; private born = performance.now();
  private environment: THREE.WebGLRenderTarget; private previousFocus = document.activeElement as HTMLElement | null;
  private readonly viewport: HTMLElement; private readonly status: HTMLElement; private signature = '';
  constructor(private opts: BenchOptions) {
    this.index = opts.current;
    this.root.className = 'wb'; this.root.setAttribute('role', 'dialog'); this.root.setAttribute('aria-modal', 'true'); this.root.setAttribute('aria-label', '총기 조립 작업대');
    this.root.innerHTML = `<header class="wb-head"><div class="wb-brand"><span class="wb-mark">Z/</span><div><small>ZERO ZONE · FIELD EQUIPMENT</small><h1>총기 작업대</h1></div></div><div class="wb-head-right"><span class="wb-mode">${opts.demo ? '자유 조립 · 모든 파츠 사용 가능' : opts.live ? '실시간 대전 · 조립 중에도 공격받습니다' : '장비 정비 · 경기 일시정지'}</span><button class="wb-close" data-close aria-label="작업대 닫기">닫기 <kbd>Esc</kbd></button></div></header>
      <div class="wb-layout"><nav class="wb-weapons" aria-label="보유 총기"></nav><main class="wb-main"><div class="wb-title"><small id="wb-code"></small><h2 id="wb-name"></h2><span class="wb-caliber">MODULAR WEAPON SYSTEM</span></div><div class="wb-viewport"><canvas aria-label="총기 3D 미리보기. 드래그로 회전하고 휠로 확대합니다."></canvas><div class="wb-hotspots"></div><span class="wb-stage-label">INSPECTION / 360°</span><div class="wb-tools"><button data-reset>시점 초기화</button><button data-explode aria-pressed="false">분해 보기</button></div></div><div class="wb-viewhint">드래그해서 회전 · 휠 / 두 손가락으로 확대 · 장착 지점 선택</div><div class="wb-performance" aria-label="총기 성능"></div></main><aside class="wb-inspector"><div class="wb-section-title"><span>장착 부위</span><small>01—04</small></div><div class="wb-slots"></div><div class="wb-detail"></div></aside></div>
      <footer class="wb-inventory"><div class="wb-section-title"><span>파츠 케이스 <b class="wb-bagcount"></b></span><small>장착할 파츠를 선택하세요</small></div><div class="wb-parts"></div></footer><div class="wb-status" role="status" aria-live="polite"></div>`;
    document.body.append(this.root);
    this.viewport = this.q('.wb-viewport'); this.status = this.q('.wb-status');
    const canvas = this.q<HTMLCanvasElement>('canvas');
    try { this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' }); }
    catch (error) { this.root.remove(); throw error; }
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); this.renderer.setClearColor(0x171c1b); this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.4;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(this.renderer); this.environment = pmrem.fromScene(room, 0.04); this.scene.environment = this.environment.texture; room.dispose(); pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight(0xdde9f0, 0x353026, 1.2));
    const key = new THREE.DirectionalLight(0xffead0, 4); key.position.set(-2, 5, 3); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = key.shadow.camera.bottom = -5; key.shadow.camera.right = key.shadow.camera.top = 5; key.shadow.normalBias = 0.03; this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xa0cadc, 3); rim.position.set(2, 2, -3); this.scene.add(rim);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x202826, roughness: 0.85 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -1.15; floor.receiveShadow = true; this.scene.add(floor);
    const grid = new THREE.GridHelper(30, 60, 0x404e47, 0x2d3832); grid.position.y = -1.145; this.scene.add(grid);
    this.scene.fog = new THREE.Fog(0x171c1b, 9, 24);
    this.controls = new OrbitControls(this.camera, canvas); this.controls.enableDamping = true; this.controls.enablePan = false; this.controls.minDistance = 2.5; this.controls.maxDistance = 12; this.controls.minPolarAngle = 0.25; this.controls.maxPolarAngle = Math.PI * 0.72; this.resetCamera();
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(this.viewport);
    this.root.addEventListener('dragstart', e => { const button = (e.target as HTMLElement).closest<HTMLElement>('[data-part]'); if (button && e.dataTransfer) e.dataTransfer.setData('text/plain', button.dataset.part!); });
    this.root.addEventListener('dragover', e => { if ((e.target as HTMLElement).closest('[data-slot]')) e.preventDefault(); });
    this.root.addEventListener('drop', e => { const target = (e.target as HTMLElement).closest<HTMLElement>('[data-slot]'); const part = e.dataTransfer?.getData('text/plain') as PartId; if (!target || !PART_IDS.includes(part)) return; e.preventDefault(); const slot = target.dataset.slot as PartSlot; if (PARTS[part].slot === slot && this.opts.equip(this.index, slot, part)) { this.slot = slot; this.preview = null; this.paint(); } });
    this.root.addEventListener('click', this.click); this.root.addEventListener('keydown', this.onKey);
    this.paint(); this.resize(); this.raf = requestAnimationFrame(this.frame); this.q<HTMLButtonElement>('[data-close]').focus();
  }
  private q<T extends HTMLElement = HTMLElement>(s: string): T { return this.root.querySelector<T>(s)!; }
  private get gun(): ModularGun { return this.opts.guns[this.index]!; }
  private resetCamera(): void { const distance = Math.max(5.8, 5 / (2 * Math.tan(34 * Math.PI / 360) * this.camera.aspect)); this.camera.position.set(1.35, 1.25, 5.5).normalize().multiplyScalar(distance); this.controls?.target.set(0, 0, 0); this.controls?.update(); }
  private resize(): void { const w = this.viewport.clientWidth, h = this.viewport.clientHeight; if (!w || !h) return; const changed = Math.abs(this.camera.aspect - w / h) > 0.08; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); if (changed) this.resetCamera(); }
  private onKey = (e: KeyboardEvent): void => {
    e.stopPropagation();
    if (e.code === 'Escape' || e.code === 'Tab' && !e.shiftKey && e.ctrlKey) { e.preventDefault(); this.close(); }
    if (e.code === 'Tab' && !e.ctrlKey) { const els = [...this.root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].filter(b => b.getClientRects().length); const first = els[0], last = els.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
  };
  private click = (e: MouseEvent): void => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button || button.disabled) return;
    if (button.hasAttribute('data-close')) { this.close(); return; }
    if (button.hasAttribute('data-reset')) { this.resetCamera(); return; }
    if (button.hasAttribute('data-explode')) { this.exploded = !this.exploded; button.setAttribute('aria-pressed', String(this.exploded)); return; }
    if (button.dataset.gun !== undefined) { this.index = Number(button.dataset.gun); this.preview = null; this.paint(); this.resetCamera(); return; }
    if (button.dataset.slot) { this.slot = button.dataset.slot as PartSlot; this.preview = null; this.paint(); return; }
    if (button.dataset.part || button.hasAttribute('data-remove')) {
      const part = button.dataset.part as PartId | undefined;
      if (this.opts.equip(this.index, this.slot, part ?? null)) { this.preview = null; this.paint(); this.status.textContent = part ? `${PARTS[part].name} 장착 완료` : '파츠를 분리해 케이스에 넣었습니다'; this.born = performance.now(); }
      else { this.status.textContent = '장전 중이거나 파츠 케이스가 가득 찼습니다'; }
    }
  };
  private paint(): void {
    const gun = this.gun, installed = gun.parts?.[this.slot]; this.signature = JSON.stringify([gun, this.opts.bag]);
    this.q('.wb-weapons').innerHTML = this.opts.guns.map((g, i) => g ? `<button data-gun="${i}" aria-pressed="${this.index === i}"><span>0${i + 1}</span><b>${WEAPONS[g.id].name}</b><small>${WEAPON_CODES[g.id].split(' / ')[0]}</small></button>` : '').join('');
    this.q('#wb-code').textContent = WEAPON_CODES[gun.id]; this.q('#wb-name').textContent = WEAPONS[gun.id].name;
    this.q('.wb-bagcount').textContent = `${this.opts.bag.length} / 16`;
    this.q('.wb-slots').innerHTML = SLOTS.map((slot, i) => `<button data-slot="${slot}" aria-pressed="${slot === this.slot}"><span class="wb-slot-num">0${i + 1}</span>${icon(slot)}<span><small>${SLOT_NAMES[slot]}</small><b>${gun.parts?.[slot] ? PARTS[gun.parts[slot]!].name : '기본 장비'}</b></span><i>${gun.parts?.[slot] ? '●' : '+'}</i></button>`).join('');
    this.q('.wb-hotspots').innerHTML = SLOTS.filter(slot => slot !== 'grip' || gun.id !== 'pistol').map(slot => `<button data-slot="${slot}" class="wb-hotspot ${slot === this.slot ? 'active' : ''}" aria-label="${SLOT_NAMES[slot]} 선택"><i></i><span>${SLOT_NAMES[slot]}</span></button>`).join('');
    this.q('.wb-detail').innerHTML = `<small>${SLOT_NAMES[this.slot]} / ${installed ? PARTS[installed].code : 'STANDARD'}</small><h3>${installed ? PARTS[installed].name : '기본 장비'}</h3><p>${installed ? PARTS[installed].detail : '아래 케이스에서 호환되는 파츠를 골라 장착하세요.'}</p><button data-remove ${installed ? '' : 'disabled'}>파츠 분리 <span>↗</span></button>`;
    const choices = PART_IDS.filter(id => PARTS[id].slot === this.slot);
    this.q('.wb-parts').innerHTML = choices.map(id => {
      const def = PARTS[id], count = this.opts.bag.filter(p => p === id).length, fits = compatible(gun.id, id);
      return `<button data-part="${id}" draggable="${count > 0 && fits}" ${!count || !fits ? 'disabled' : ''} title="${def.detail}"><span class="wb-part-art">${icon(def.slot)}<small>${def.code}</small></span><span class="wb-part-copy"><b>${def.name}</b><small>${def.detail}</small></span><em>${!fits ? '호환 안 됨' : count ? `장착 · ${count}개` : installed === id ? '장착 중' : '미보유'}</em></button>`;
    }).join('') + (installed ? `<button class="wb-remove-card" data-remove>${icon(this.slot)}<span class="wb-part-copy"><b>장착 파츠 분리</b><small>${PARTS[installed].name} → 파츠 케이스</small></span></button>` : '');
    this.q('.wb-parts').querySelectorAll<HTMLButtonElement>('button[data-part]:not(:disabled)').forEach(button => {
      const preview = (): void => { this.preview = button.dataset.part as PartId; this.buildModel(); this.paintStats(); };
      const clear = (): void => { if (this.preview) { this.preview = null; this.buildModel(); this.paintStats(); } };
      button.onmouseenter = preview; button.onfocus = preview; button.onmouseleave = clear; button.onblur = clear;
    });
    this.buildModel(); this.paintStats();
  }
  private paintStats(): void {
    const gun = this.gun, stats = gunStats(gun), candidate = this.preview ? gunStats({ ...gun, parts: { ...gun.parts, [this.slot]: this.preview } }) : stats, base = WEAPONS[gun.id];
    const values: Array<[string, string, number, number]> = [
      ['장탄수', `${candidate.mag} 발`, stats.mag / 50, candidate.mag / 50],
      ['반동 제어', `${Math.round((1 - candidate.recoil / base.recoil) * 100)}%`, 1 - stats.recoil / base.recoil * 0.75, 1 - candidate.recoil / base.recoil * 0.75],
      ['장전 시간', `${candidate.reload.toFixed(2)} 초`, 1 - stats.reload / 4, 1 - candidate.reload / 4],
      ['조준 배율', `${candidate.zoom.toFixed(1)}×`, stats.zoom / 4, candidate.zoom / 4],
    ];
    this.q('.wb-performance').innerHTML = values.map(([label, value, current, next]) => `<div><small>${label}</small><b class="${this.preview ? 'preview' : ''}">${value}</b><span><i style="width:${Math.min(100, Math.max(2, next * 100))}%"></i>${this.preview ? `<em style="left:${Math.min(100, Math.max(0, current * 100))}%"></em>` : ''}</span></div>`).join('');
  }
  private buildModel(): void {
    if (this.model) { this.scene.remove(this.model); disposeModel(this.model); }
    const gun = this.gun;
    this.model = makeModularGun(this.preview ? { ...gun, parts: { ...gun.parts, [this.slot]: this.preview } } : gun);
    this.model.scale.setScalar(gun.id === 'pistol' ? 3.5 : 2.15); this.scene.add(this.model); this.born = performance.now();
    for (const child of this.model.children) if (child.userData.slot) child.userData.home = child.position.clone();
  }
  private frame = (): void => {
    if (this.disposed) return;
    if (JSON.stringify([this.gun, this.opts.bag]) !== this.signature) { this.preview = null; this.paint(); }
    this.controls.update();
    const elapsed = (performance.now() - this.born) / 1000, entry = Math.max(0, 1 - elapsed * 4);
    if (this.model) {
      for (const child of this.model.children) if (child.userData.home) {
        const target = child.userData.home as THREE.Vector3, slot = child.userData.slot as PartSlot;
        const offset = this.exploded ? 0.18 : entry * entry * 0.16;
        child.position.copy(target); if (slot === 'muzzle') child.position.x += offset; else child.position.y += slot === 'optic' ? offset : -offset;
      }
      this.model.updateMatrixWorld();
      const mounts = mountPoints(this.gun.id);
      this.root.querySelectorAll<HTMLButtonElement>('.wb-hotspot').forEach(button => {
        const point = this.model!.localToWorld(mounts[button.dataset.slot as PartSlot].clone()).project(this.camera);
        button.style.left = `${(point.x * 0.5 + 0.5) * 100}%`; button.style.top = `${(-point.y * 0.5 + 0.5) * 100}%`;
      });
    }
    this.renderer.render(this.scene, this.camera); this.raf = requestAnimationFrame(this.frame);
  };
  close(): void { if (this.disposed) return; this.dispose(); this.opts.close(); }
  dispose(): void {
    if (this.disposed) return; this.disposed = true; cancelAnimationFrame(this.raf); this.observer.disconnect(); this.controls.dispose(); this.environment.dispose(); disposeModel(this.scene); this.renderer.dispose(); this.renderer.forceContextLoss(); this.root.remove(); if (this.previousFocus?.isConnected) this.previousFocus.focus();
  }
}
