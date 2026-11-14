// LAST CITY — 캔버스 렌더러 (유사 3D 건물, 파티클, 자기장, 미니맵)
import { ACTORS, BIZ, BLOCK, BLOCKS, CIV, FACTIONS, PITCH, POLICE, ROAD, SIZE, STRUCTS, WEAPONS, type StructKind } from './defs';
import type { Actor, Fx, Vehicle, World } from './world';

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; kind: 0 | 1 | 2 | 3; text?: string }
interface Decal { x: number; y: number; r: number; color: string; ang: number; kind: 0 | 1 }
export interface Ghost { kind: StructKind; x: number; y: number; ok: boolean }
const SKIN = ['#f1c9a5', '#d9a47a', '#a8744f', '#7a5236', '#f5d6b8'];
const CLOTH = ['#8d99ae', '#b08968', '#6d8a96', '#a58fb3', '#9aa37b', '#c58f8f'];
const BLOCK_COLORS: Record<string, string> = { city: '#3a4049', park: '#2c4a35', lot: '#31353c', police: '#34405a', military: '#3d4233', plaza: '#4a4e58', base: '#33393a', void: '#1d2026' };
const fcolor = (f: number): string => f === POLICE ? '#5b8cff' : f === CIV ? '#9aa3ad' : FACTIONS[f]?.color ?? '#fff';

/** 1대1 결투에서 상대가 벽 너머여도 미니맵에 잡히는 근접 거리(그보다 멀면 시야에 보일 때만 표시). */
const DUEL_RADAR = 700;
export class Renderer {
  ctx: CanvasRenderingContext2D; cam = { x: 0, y: 0, zoom: 1 }; shake = 0; parts: Particle[] = []; decals: Decal[] = []; rings: { x: number; y: number; r: number; max: number; life: number; color: string }[] = [];
  w = 0; h = 0; dpr = 1; hurt = 0; mini: HTMLCanvasElement | null = null; reduced = false; t = 0;
  constructor(public canvas: HTMLCanvasElement, public world: World) { this.ctx = canvas.getContext('2d', { alpha: false })!; this.resize(); }
  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1); this.w = this.canvas.clientWidth || window.innerWidth; this.h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr); this.canvas.height = Math.round(this.h * this.dpr);
  }
  toWorld(sx: number, sy: number): { x: number; y: number } { return { x: (sx - this.w / 2) / this.cam.zoom + this.cam.x, y: (sy - this.h / 2) / this.cam.zoom + this.cam.y }; }
  toScreen(x: number, y: number): { x: number; y: number } { return { x: (x - this.cam.x) * this.cam.zoom + this.w / 2, y: (y - this.cam.y) * this.cam.zoom + this.h / 2 }; }
  visible(x: number, y: number, m = 80): boolean { const hw = this.w / 2 / this.cam.zoom + m, hh = this.h / 2 / this.cam.zoom + m; return Math.abs(x - this.cam.x) < hw && Math.abs(y - this.cam.y) < hh; }
  part(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, kind: Particle['kind'] = 0, text?: string): void { if (this.parts.length < 700) this.parts.push({ x, y, vx, vy, life, max: life, size, color, kind, text }); }
  floater(x: number, y: number, text: string, color: string): void { this.part(x, y, 0, -34, 1.3, 15, color, 3, text); }
  decal(x: number, y: number, r: number, color: string, kind: 0 | 1 = 0, ang = 0): void { this.decals.push({ x, y, r, color, kind, ang }); if (this.decals.length > 220) this.decals.shift(); }

  /** 월드 이벤트를 시각 효과로 변환 */
  consume(events: Fx[]): void {
    for (const e of events) {
      const vis = this.visible(e.x, e.y, 200), rnd = Math.random;
      if (e.t === 'shot' && vis) { const a = e.a ?? 0; for (let k = 0; k < 3; k++) this.part(e.x, e.y, Math.cos(a + (rnd() - 0.5) * 0.6) * (120 + rnd() * 160), Math.sin(a + (rnd() - 0.5) * 0.6) * (120 + rnd() * 160), 0.09, 4, '#ffd98a', 1); this.part(e.x, e.y, 0, 0, 0.05, 13, '#fff3c4', 1); }
      else if ((e.t === 'hit' || e.t === 'splat') && vis) { const n = e.t === 'splat' ? 10 : 4; for (let k = 0; k < n; k++) this.part(e.x, e.y, (rnd() - 0.5) * 220, (rnd() - 0.5) * 220, 0.35, 3, '#c0182b'); if (rnd() < 0.4 || e.t === 'splat') this.decal(e.x + (rnd() - 0.5) * 16, e.y + (rnd() - 0.5) * 16, 5 + rnd() * 7, 'rgba(120,10,20,0.5)'); }
      else if (e.t === 'spark' && vis) { for (let k = 0; k < 3; k++) this.part(e.x, e.y, (rnd() - 0.5) * 260, (rnd() - 0.5) * 260, 0.18, 2.5, '#ffe9a8', 1); }
      else if (e.t === 'death' && vis) { for (let k = 0; k < 12; k++) this.part(e.x, e.y, (rnd() - 0.5) * 260, (rnd() - 0.5) * 260, 0.5, 3.5, k % 3 ? '#b3142a' : fcolor(e.f ?? CIV)); this.decal(e.x, e.y, 13 + rnd() * 6, 'rgba(110,8,18,0.55)'); }
      else if (e.t === 'boom') {
        const r = Math.max(50, e.a ?? 80); if (vis) { for (let k = 0; k < 22; k++) { const a = rnd() * 6.28, s = rnd() * r * 2.6; this.part(e.x, e.y, Math.cos(a) * s, Math.sin(a) * s, 0.35 + rnd() * 0.4, 7 + rnd() * 9, k % 3 === 0 ? '#fff1b8' : k % 3 === 1 ? '#ff9a3c' : '#ff5a1f', 1); }
          for (let k = 0; k < 10; k++) { const a = rnd() * 6.28; this.part(e.x, e.y, Math.cos(a) * 60, Math.sin(a) * 60 - 20, 1.1 + rnd(), 14 + rnd() * 12, 'rgba(60,60,66,0.5)', 2); }
          this.rings.push({ x: e.x, y: e.y, r: 10, max: r * 1.25, life: 0.3, color: '#ffd28a' }); this.decal(e.x, e.y, r * 0.5, 'rgba(15,15,18,0.55)'); }
        const d = Math.hypot(e.x - this.cam.x, e.y - this.cam.y); if (d < 900) this.shake = Math.max(this.shake, (1 - d / 900) * 14);
      } else if (e.t === 'cash' && vis) this.floater(e.x, e.y - 20, `${(e.a ?? 0) >= 0 ? '+' : '-'}$${Math.abs(Math.round(e.a ?? 0))}`, (e.a ?? 0) >= 0 ? '#7dffb0' : '#ffd27a');
      else if (e.t === 'crystal' && vis) this.floater(e.x, e.y - 14, `+${e.a}`, '#8fe9ff');
      else if (e.t === 'pickup' && vis) this.rings.push({ x: e.x, y: e.y, r: 6, max: 34, life: 0.3, color: '#fff' });
      else if ((e.t === 'spawn' || e.t === 'levelup' || e.t === 'capture' || e.t === 'built' || e.t === 'roar') && vis) { this.rings.push({ x: e.x, y: e.y, r: 8, max: e.t === 'roar' ? 240 : 60, life: 0.5, color: fcolor(e.f ?? 0) }); if (e.t === 'levelup') this.floater(e.x, e.y - 30, 'LEVEL UP', '#ffe27a'); if (e.t === 'built' && e.f === 0) this.floater(e.x, e.y - 30, `${e.s} 완공`, '#b8ffd9'); if (e.t === 'capture') this.floater(e.x, e.y - 30, '인수 완료', fcolor(e.f ?? 0)); }
      else if (e.t === 'order') this.rings.push({ x: e.x, y: e.y, r: 50, max: 8, life: 0.45, color: e.s === 'amove' ? '#ff6b6b' : '#7dffb0' });
      else if (e.t === 'dash' && vis) for (let k = 0; k < 6; k++) this.part(e.x, e.y, (rnd() - 0.5) * 80, (rnd() - 0.5) * 80, 0.3, 6, 'rgba(255,255,255,0.5)', 2);
      else if (e.t === 'skid' && vis) this.decal(e.x, e.y, 5, 'rgba(10,10,12,0.35)', 1, e.a ?? 0);
      else if (e.t === 'crash' && vis) { this.shake = Math.max(this.shake, 6); for (let k = 0; k < 6; k++) this.part(e.x, e.y, (rnd() - 0.5) * 300, (rnd() - 0.5) * 300, 0.2, 3, '#ffe9a8', 1); }
      else if (e.t === 'healbeam' && vis) { for (let k = 0; k < 3; k++) this.part((e.a ?? e.x) + (rnd() - 0.5) * 14, (e.b ?? e.y) + (rnd() - 0.5) * 14, 0, -40, 0.5, 4, '#7dffb0', 1); }
      else if (e.t === 'heal' && vis) for (let k = 0; k < 10; k++) this.part(e.x + (rnd() - 0.5) * 24, e.y + (rnd() - 0.5) * 24, 0, -50, 0.6, 4, '#7dffb0', 1);
      else if (e.t === 'wreck') this.decal(e.x, e.y, 34, 'rgba(8,8,10,0.7)');
      else if (e.t === 'thud' && vis) { this.rings.push({ x: e.x, y: e.y, r: 10, max: 70, life: 0.4, color: '#ffe27a' }); this.shake = Math.max(this.shake, 4); }
      else if (e.t === 'playerdown') { this.shake = 18; this.hurt = 1; }
      else if (e.t === 'recoil') this.shake = Math.max(this.shake, 5);
      else if (e.t === 'burn' && vis) for (let k = 0; k < 8; k++) this.part(e.x, e.y, (rnd() - 0.5) * 60, -40 - rnd() * 40, 0.8, 9, '#ff7a2a', 1);
    }
  }

  draw(dt: number, ghost: Ghost | null, aim: { x: number; y: number } | null): void {
    const { ctx, world: w } = this, z = this.cam.zoom; this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 40); this.hurt = Math.max(0, this.hurt - dt * 1.6);
    const sh = this.reduced ? 0 : this.shake, sx = (Math.random() - 0.5) * sh, sy = (Math.random() - 0.5) * sh;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.fillStyle = '#0d2233'; ctx.fillRect(0, 0, this.w, this.h);
    ctx.setTransform(z * this.dpr, 0, 0, z * this.dpr, (this.w / 2 - this.cam.x * z + sx) * this.dpr, (this.h / 2 - this.cam.y * z + sy) * this.dpr);
    const hw = this.w / 2 / z + 40, hh = this.h / 2 / z + 40, x0 = this.cam.x - hw, x1 = this.cam.x + hw, y0 = this.cam.y - hh, y1 = this.cam.y + hh;
    this.ground(x0, y0, x1, y1);
    // 데칼
    for (const d of this.decals) { if (!this.visible(d.x, d.y)) continue; ctx.fillStyle = d.color; if (d.kind === 1) { ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.ang); ctx.fillRect(-7, -9, 10, 3); ctx.fillRect(-7, 6, 10, 3); ctx.restore(); } else { ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.29); ctx.fill(); } }
    // 크리스탈
    for (const c of w.crystals) if (c.amount > 0 && this.visible(c.x, c.y)) { const s = 8 + 8 * c.amount / c.max; ctx.fillStyle = '#39c6e8'; ctx.beginPath(); ctx.moveTo(c.x, c.y - s); ctx.lineTo(c.x + s * 0.7, c.y); ctx.lineTo(c.x, c.y + s * 0.8); ctx.lineTo(c.x - s * 0.7, c.y); ctx.fill(); ctx.fillStyle = '#b9f3ff'; ctx.beginPath(); ctx.moveTo(c.x, c.y - s); ctx.lineTo(c.x + s * 0.7, c.y); ctx.lineTo(c.x, c.y - s * 0.1); ctx.fill(); }
    this.pads(); this.lootLayer();
    // 건설 고스트
    if (ghost) { const d = STRUCTS[ghost.kind]; ctx.fillStyle = ghost.ok ? 'rgba(90,255,160,0.35)' : 'rgba(255,80,80,0.35)'; ctx.strokeStyle = ghost.ok ? '#7dffb0' : '#ff6b6b'; ctx.lineWidth = 2; ctx.fillRect(ghost.x - d.w / 2, ghost.y - d.h / 2, d.w, d.h); ctx.strokeRect(ghost.x - d.w / 2, ghost.y - d.h / 2, d.w, d.h); const hq = w.hq(0); if (hq) { ctx.setLineDash([10, 10]); ctx.strokeStyle = 'rgba(125,255,176,0.4)'; ctx.beginPath(); ctx.arc(hq.x + 60, hq.y + 60, 330, 0, 6.29); ctx.stroke(); ctx.setLineDash([]); } }
    for (const r of this.rings) { r.life -= dt; const k = 1 - Math.max(0, r.life) / 0.5; ctx.strokeStyle = r.color; ctx.globalAlpha = Math.max(0, Math.min(1, r.life * 3)); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(r.x, r.y, r.r + (r.max - r.r) * Math.min(1, k * 1.6), 0, 6.29); ctx.stroke(); }
    ctx.globalAlpha = 1; this.rings = this.rings.filter(r => r.life > 0);
    // 차량·캐릭터
    for (const v of w.vehicles) if (v.alive && this.visible(v.x, v.y)) this.vehicle(v);
    const pb = w.boss(0);
    for (const a of w.actors) if (a.alive && !a.inVeh && this.visible(a.x, a.y)) this.actor(a, a === pb);
    // 조준선
    if (pb && aim && !pb.inVeh) { const wd = WEAPONS[w.factions[0].slots[w.factions[0].cur].id], d = Math.min(wd.range, Math.hypot(aim.x - pb.x, aim.y - pb.y)); ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 8]); ctx.beginPath(); ctx.moveTo(pb.x + Math.cos(pb.ang) * 22, pb.y + Math.sin(pb.ang) * 22); ctx.lineTo(pb.x + Math.cos(pb.ang) * d, pb.y + Math.sin(pb.ang) * d); ctx.stroke(); ctx.setLineDash([]); }
    // 탄환
    ctx.lineCap = 'round';
    for (const b of w.bullets) { if (!this.visible(b.x, b.y)) continue; const d = WEAPONS[b.w]; if (d.splash) { ctx.fillStyle = '#ffb066'; ctx.beginPath(); ctx.arc(b.x, b.y, 4.5, 0, 6.29); ctx.fill(); this.part(b.x, b.y, 0, 0, 0.35, 5, 'rgba(200,200,200,0.35)', 2); } else { ctx.strokeStyle = d.color; ctx.lineWidth = d.pierce ? 4 : b.boss ? 2.6 : 1.8; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.moveTo(b.px - b.vx * 0.012, b.py - b.vy * 0.012); ctx.lineTo(b.x, b.y); ctx.stroke(); } }
    ctx.globalAlpha = 1;
    this.buildings(pb, x0, y0, x1, y1);
    // 파티클
    for (const p of this.parts) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.kind !== 3) { p.vx *= 0.93; p.vy *= 0.93; } const k = Math.max(0, p.life / p.max);
      if (p.kind === 3) { ctx.globalAlpha = Math.min(1, k * 2); ctx.font = `800 ${p.size}px 'Noto Sans KR',sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(p.text!, p.x, p.y); ctx.fillStyle = p.color; ctx.fillText(p.text!, p.x, p.y); continue; }
      ctx.globalAlpha = p.kind === 2 ? k * 0.8 : k; if (p.kind === 1) ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.kind === 2 ? 1.6 - k * 0.6 : 0.4 + k * 0.6), 0, 6.29); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1; this.parts = this.parts.filter(p => p.life > 0);
    // 수송기
    for (const p of w.planes) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx)); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-40, 50, 90, 16); ctx.fillStyle = '#cfd6e0'; ctx.beginPath(); ctx.moveTo(60, 0); ctx.lineTo(-40, -12); ctx.lineTo(-40, 12); ctx.fill(); ctx.fillRect(-10, -60, 26, 120); ctx.fillRect(-46, -24, 14, 48); ctx.restore(); }
    this.zoneLayer(x0, y0, x1, y1);
    // 화면 고정 오버레이
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const lowHp = pb ? pb.hp / pb.maxHp : 1, red = Math.max(this.hurt * 0.5, lowHp < 0.35 ? 0.25 + Math.sin(this.t * 6) * 0.1 : 0);
    if (red > 0.01) { const g = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.35, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75); g.addColorStop(0, 'rgba(255,0,30,0)'); g.addColorStop(1, `rgba(255,0,30,${red})`); ctx.fillStyle = g; ctx.fillRect(0, 0, this.w, this.h); }
    if (pb && Math.hypot(pb.x - w.zone.x, pb.y - w.zone.y) > w.zone.r) { ctx.fillStyle = `rgba(150,80,255,${0.12 + Math.sin(this.t * 5) * 0.05})`; ctx.fillRect(0, 0, this.w, this.h); }
    if (pb) { // 화면 밖 지시 화살표
      const zn = w.zone; if (Math.hypot(pb.x - zn.nx, pb.y - zn.ny) > zn.nr && zn.nr < 3800) this.arrow(zn.nx, zn.ny, '#c9a2ff', '안전지대');
      for (const l of w.loot) if (l.alive && l.type === 'crate') this.arrow(l.x, l.y, '#ffe27a', '보급');
      const hq = w.hq(0); if (hq && w.time - hq.hurtT < 4) this.arrow(hq.x + 60, hq.y + 60, '#ff6b6b', '본부 피격!');
    }
  }
  arrow(x: number, y: number, color: string, label: string): void {
    const s = this.toScreen(x, y), m = 46; if (s.x > m && s.y > m && s.x < this.w - m && s.y < this.h - m) return;
    const { ctx } = this, cx = this.w / 2, cy = this.h / 2, a = Math.atan2(s.y - cy, s.x - cx), k = Math.min((cx - m) / Math.abs(Math.cos(a) || 1e-6), (cy - m) / Math.abs(Math.sin(a) || 1e-6)), px = cx + Math.cos(a) * k, py = cy + Math.sin(a) * k;
    ctx.save(); ctx.translate(px, py); ctx.rotate(a); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.fill(); ctx.restore();
    ctx.font = "700 11px 'Noto Sans KR',sans-serif"; ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.fillText(`${label} ${Math.round(Math.hypot(x - this.cam.x, y - this.cam.y) / 10)}m`, Math.max(50, Math.min(this.w - 50, px - Math.cos(a) * 34)), Math.max(20, Math.min(this.h - 12, py - Math.sin(a) * 26)));
  }
  ground(x0: number, y0: number, x1: number, y1: number): void {
    const { ctx, world: w } = this;
    ctx.fillStyle = '#262a31'; ctx.fillRect(0, 0, SIZE, SIZE);
    const i0 = Math.max(0, Math.floor((x0 - ROAD) / PITCH)), i1 = Math.min(BLOCKS - 1, Math.floor(x1 / PITCH)), j0 = Math.max(0, Math.floor((y0 - ROAD) / PITCH)), j1 = Math.min(BLOCKS - 1, Math.floor(y1 / PITCH));
    // 차선
    ctx.strokeStyle = 'rgba(214,190,96,0.5)'; ctx.lineWidth = 3; ctx.setLineDash([22, 26]); ctx.beginPath();
    for (let i = i0; i <= i1 + 1; i++) { const x = i * PITCH + ROAD / 2; ctx.moveTo(x, Math.max(0, y0)); ctx.lineTo(x, Math.min(SIZE, y1)); }
    for (let j = j0; j <= j1 + 1; j++) { const y = j * PITCH + ROAD / 2; ctx.moveTo(Math.max(0, x0), y); ctx.lineTo(Math.min(SIZE, x1), y); }
    ctx.stroke(); ctx.setLineDash([]);
    for (let j = j0; j <= j1 + 1; j++) for (let i = i0; i <= i1 + 1; i++) { // 교차로 + 횡단보도
      const x = i * PITCH, y = j * PITCH; ctx.fillStyle = '#262a31'; ctx.fillRect(x, y, ROAD, ROAD); ctx.fillStyle = 'rgba(230,230,235,0.22)';
      for (let k = 0; k < 6; k++) { ctx.fillRect(x + 12 + k * 17, y - 16, 9, 12); ctx.fillRect(x + 12 + k * 17, y + ROAD + 4, 9, 12); ctx.fillRect(x - 16, y + 12 + k * 17, 12, 9); ctx.fillRect(x + ROAD + 4, y + 12 + k * 17, 12, 9); }
    }
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const b = w.map.blocks[j * BLOCKS + i]; ctx.fillStyle = '#565c67'; ctx.fillRect(b.x, b.y, BLOCK, BLOCK);
      ctx.fillStyle = BLOCK_COLORS[b.type]; ctx.fillRect(b.x + 6, b.y + 6, BLOCK - 12, BLOCK - 12);
      if (b.type === 'plaza') { ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1; ctx.beginPath(); for (let k = 1; k < 11; k++) { ctx.moveTo(b.x + k * 40, b.y + 6); ctx.lineTo(b.x + k * 40, b.y + BLOCK - 6); ctx.moveTo(b.x + 6, b.y + k * 40); ctx.lineTo(b.x + BLOCK - 6, b.y + k * 40); } ctx.stroke(); }
      else if (b.type === 'lot') { ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.beginPath(); for (let k = 0; k < 6; k++) { ctx.moveTo(b.x + 56 + k * 68, b.y + 290); ctx.lineTo(b.x + 56 + k * 68, b.y + 370); } ctx.stroke(); }
      else if (b.type === 'base') { const owner = w.factions.find(f => { const h = w.hq(f.id); return h && h.x > b.x && h.x < b.x + BLOCK && h.y > b.y && h.y < b.y + BLOCK; }); if (owner) { ctx.strokeStyle = owner.color; ctx.globalAlpha = 0.5; ctx.lineWidth = 4; ctx.strokeRect(b.x + 10, b.y + 10, BLOCK - 20, BLOCK - 20); ctx.globalAlpha = 1; } }
    }
  }
  pads(): void {
    const { ctx, world: w } = this;
    for (const z of w.businesses) {
      if (!this.visible(z.x, z.y)) continue; const d = BIZ[z.kind], col = z.kind === 'gunshop' ? '#ff5d5d' : z.owner >= 0 ? FACTIONS[z.owner].color : '#e9ecef';
      const o = w.doorOut(z), px = -o.y, py = o.x; ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(z.x - o.x * 18 + px * 22, z.y - o.y * 18 + py * 22); ctx.lineTo(z.x - o.x * 18 - px * 22, z.y - o.y * 18 - py * 22); ctx.stroke();
      if (z.cap > 0) { ctx.strokeStyle = FACTIONS[z.capBy]?.color ?? '#fff'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(z.x, z.y, 30, -1.57, -1.57 + 6.283 * Math.min(1, z.cap / 6)); ctx.stroke(); }
      ctx.font = "800 12px 'Noto Sans KR',sans-serif"; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      const label = z.kind === 'gunshop' ? '무기상' : z.owner < 0 ? `${d.name} $${d.price}` : `${d.name} ${'★'.repeat(z.level)}`;
      ctx.strokeText(label, z.x + o.x * 20, z.y + o.y * 20 + 4); ctx.fillStyle = '#fff'; ctx.fillText(label, z.x + o.x * 20, z.y + o.y * 20 + 4);
    }
  }
  lootLayer(): void {
    const { ctx, world: w } = this;
    for (const l of w.loot) {
      if (!l.alive || !this.visible(l.x, l.y, 200)) continue; const bob = Math.sin(this.t * 4 + l.id) * 2;
      if (l.type === 'crate') {
        if (l.fall > 0) { const h = l.fall * 120; ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 20, 9, 0, 0, 6.29); ctx.fill(); ctx.fillStyle = '#ff5d5d'; ctx.beginPath(); ctx.arc(l.x, l.y - h - 30, 26, Math.PI, 0); ctx.fill(); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(l.x - 26, l.y - h - 30); ctx.lineTo(l.x, l.y - h); ctx.lineTo(l.x + 26, l.y - h - 30); ctx.stroke(); ctx.fillStyle = '#c9a227'; ctx.fillRect(l.x - 13, l.y - h - 10, 26, 20); continue; }
        ctx.globalCompositeOperation = 'lighter'; const g = ctx.createLinearGradient(0, l.y - 320, 0, l.y); g.addColorStop(0, 'rgba(255,226,122,0)'); g.addColorStop(1, 'rgba(255,226,122,0.5)'); ctx.fillStyle = g; ctx.fillRect(l.x - 7, l.y - 320, 14, 320); ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#c9a227'; ctx.fillRect(l.x - 15, l.y - 12, 30, 24); ctx.strokeStyle = '#5c470b'; ctx.lineWidth = 2; ctx.strokeRect(l.x - 15, l.y - 12, 30, 24); ctx.beginPath(); ctx.moveTo(l.x - 15, l.y); ctx.lineTo(l.x + 15, l.y); ctx.stroke(); continue;
      }
      const col = l.type === 'cash' ? '#7dffb0' : l.type === 'armor' ? '#6fb2ff' : l.type === 'medkit' ? '#ff8a8a' : WEAPONS[l.weapon!].tier >= 3 ? '#ffb347' : WEAPONS[l.weapon!].tier === 2 ? '#c59bff' : '#e9ecef';
      ctx.globalAlpha = 0.25; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(l.x, l.y, 16, 0, 6.29); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5;
      if (l.type === 'weapon') { ctx.fillRect(l.x - 11, l.y - 3 + bob, 22, 5); ctx.fillRect(l.x - 9, l.y + bob, 5, 8); ctx.font = "700 10px 'Noto Sans KR',sans-serif"; ctx.textAlign = 'center'; ctx.strokeText(WEAPONS[l.weapon!].name, l.x, l.y - 12); ctx.fillText(WEAPONS[l.weapon!].name, l.x, l.y - 12); }
      else if (l.type === 'cash') { ctx.fillRect(l.x - 9, l.y - 5 + bob, 18, 10); ctx.fillStyle = '#0b3d22'; ctx.font = '800 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('$', l.x, l.y + 3 + bob); }
      else if (l.type === 'armor') { ctx.beginPath(); ctx.moveTo(l.x, l.y - 9 + bob); ctx.lineTo(l.x + 8, l.y - 5 + bob); ctx.lineTo(l.x + 6, l.y + 6 + bob); ctx.lineTo(l.x, l.y + 10 + bob); ctx.lineTo(l.x - 6, l.y + 6 + bob); ctx.lineTo(l.x - 8, l.y - 5 + bob); ctx.fill(); }
      else { ctx.fillStyle = '#fff'; ctx.fillRect(l.x - 8, l.y - 7 + bob, 16, 14); ctx.fillStyle = '#e03131'; ctx.fillRect(l.x - 2, l.y - 5 + bob, 4, 10); ctx.fillRect(l.x - 5, l.y - 2 + bob, 10, 4); }
    }
  }
  actor(a: Actor, isPlayer: boolean): void {
    const { ctx, world: w } = this, def = ACTORS[a.kind], col = a.f === CIV ? CLOTH[a.slot % CLOTH.length] : fcolor(a.f);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(a.x + 3, a.y + 4, a.r * 1.05, a.r * 0.8, 0, 0, 6.29); ctx.fill();
    ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.ang);
    if (def.mech) {
      const L = a.r * 1.25, W2 = a.r * 0.9; ctx.fillStyle = '#23262b'; ctx.fillRect(-L, -W2 - 3, L * 2, 6); ctx.fillRect(-L, W2 - 3, L * 2, 6);
      ctx.fillStyle = a.flash > 0 ? '#fff' : FACTIONS[a.f]?.dark ?? '#555'; ctx.fillRect(-L + 2, -W2, L * 2 - 4, W2 * 2); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, a.r * 0.55, 0, 6.29); ctx.fill();
      ctx.fillStyle = '#1b1d21'; ctx.fillRect(0, -2.5, a.r * (a.kind === 'tank' ? 1.7 : 1.2), 5);
    } else {
      const sw = Math.sin(a.walk * 0.09) * 4 * Math.min(1, Math.hypot(a.vx, a.vy) / 60);
      ctx.fillStyle = '#17191d'; ctx.beginPath(); ctx.ellipse(sw, -a.r * 0.45, 4, 3, 0, 0, 6.29); ctx.ellipse(-sw, a.r * 0.45, 4, 3, 0, 0, 6.29); ctx.fill();
      if (a.f !== CIV && a.kind !== 'worker') { ctx.fillStyle = '#15171a'; ctx.fillRect(a.r * 0.3, a.r * 0.25, a.r * (a.kind === 'sniper' || a.kind === 'heavy' ? 1.7 : 1.25), a.kind === 'heavy' ? 5 : 3); }
      ctx.fillStyle = a.flash > 0 ? '#fff' : col; ctx.beginPath(); ctx.ellipse(0, 0, a.r * 0.78, a.r, 0, 0, 6.29); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = a.kind === 'cop' || a.kind === 'swat' ? '#1c2a55' : a.kind === 'medic' ? '#fff' : SKIN[a.id % SKIN.length]; ctx.beginPath(); ctx.arc(1, 0, a.r * 0.48, 0, 6.29); ctx.fill();
      if (a.kind === 'medic') { ctx.fillStyle = '#e03131'; ctx.fillRect(-1, -3.5, 3, 7); ctx.fillRect(-3, -1.5, 7, 3); }
      if (a.kind === 'boss') { ctx.fillStyle = '#16181c'; ctx.beginPath(); ctx.arc(1, 0, a.r * 0.5, 1.57, 4.71); ctx.fill(); }
      if (a.carry > 0) { ctx.fillStyle = '#5fe0ff'; ctx.fillRect(-a.r - 3, -4, 7, 8); }
    }
    ctx.restore();
    if (a.kind === 'boss') {
      const f = w.factions[a.f]; ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(a.x, a.y, a.r + 6, 0, 6.29); ctx.stroke();
      if (f.dashT > 0 || f.buffT > 0) { ctx.globalAlpha = 0.35; ctx.fillStyle = f.buffT > 0 ? '#ffb347' : '#fff'; ctx.beginPath(); ctx.arc(a.x, a.y, a.r + 10, 0, 6.29); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.font = "800 11px 'Noto Sans KR',sans-serif"; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; const name = isPlayer ? `나 · Lv.${f.level}` : `${f.name} Lv.${f.level}`; ctx.strokeText(name, a.x, a.y - a.r - 17); ctx.fillStyle = col; ctx.fillText(name, a.x, a.y - a.r - 17);
    }
    if (a.hp < a.maxHp || a.kind === 'boss') { const bw = a.kind === 'boss' ? 40 : def.mech ? 34 : 22, k = Math.max(0, a.hp / a.maxHp); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(a.x - bw / 2 - 1, a.y - a.r - 12, bw + 2, 6); ctx.fillStyle = a.f === 0 ? '#5dfc9b' : k > 0.5 ? '#ffd24a' : '#ff5d5d'; ctx.fillRect(a.x - bw / 2, a.y - a.r - 11, bw * k, 4); if (a.kind === 'boss' && w.factions[a.f].armor > 0) { ctx.fillStyle = '#6fb2ff'; ctx.fillRect(a.x - bw / 2, a.y - a.r - 7, bw * w.factions[a.f].armor / 100, 2); } }
  }
  vehicle(v: Vehicle): void {
    const { ctx, world: w } = this, L = v.len, W2 = v.wid;
    ctx.save(); ctx.translate(v.x, v.y); ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.rotate(v.ang); ctx.fillRect(-L / 2 + 4, -W2 / 2 + 5, L, W2);
    if (v.kind === 'tank') {
      ctx.fillStyle = '#22251e'; ctx.fillRect(-L / 2, -W2 / 2 - 3, L, 9); ctx.fillRect(-L / 2, W2 / 2 - 6, L, 9); ctx.fillStyle = v.color; ctx.fillRect(-L / 2 + 3, -W2 / 2 + 3, L - 6, W2 - 6);
      const d = w.byId.get(v.driver); ctx.rotate((d ? d.ang : v.ang) - v.ang); ctx.fillStyle = '#44512f'; ctx.beginPath(); ctx.arc(0, 0, 14, 0, 6.29); ctx.fill(); ctx.fillStyle = '#1e2218'; ctx.fillRect(8, -3.5, 36, 7);
    } else {
      ctx.fillStyle = '#111'; ctx.fillRect(-L / 2 + 6, -W2 / 2 - 2, 10, 4); ctx.fillRect(L / 2 - 16, -W2 / 2 - 2, 10, 4); ctx.fillRect(-L / 2 + 6, W2 / 2 - 2, 10, 4); ctx.fillRect(L / 2 - 16, W2 / 2 - 2, 10, 4);
      ctx.fillStyle = v.color; ctx.beginPath(); ctx.roundRect(-L / 2, -W2 / 2, L, W2, 6); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = 'rgba(20,30,45,0.85)'; ctx.fillRect(L * 0.08, -W2 / 2 + 3, L * 0.2, W2 - 6); ctx.fillRect(-L * 0.32, -W2 / 2 + 3, L * 0.14, W2 - 6);
      if (v.kind === 'truck') { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-L / 2 + 2, -W2 / 2 + 2, L * 0.55, W2 - 4); }
      ctx.fillStyle = '#fff7c2'; ctx.fillRect(L / 2 - 3, -W2 / 2 + 2, 3, 5); ctx.fillRect(L / 2 - 3, W2 / 2 - 7, 3, 5); ctx.fillStyle = '#ff3b3b'; ctx.fillRect(-L / 2, -W2 / 2 + 2, 2, 5); ctx.fillRect(-L / 2, W2 / 2 - 7, 2, 5);
      if (v.kind === 'police') { const on = v.ai === 'chase' && Math.floor(this.t * 6) % 2 === 0; ctx.fillStyle = on ? '#ff2d2d' : '#2d5bff'; ctx.fillRect(-4, -W2 / 2 + 2, 6, (W2 - 4) / 2); ctx.fillStyle = on ? '#2d5bff' : '#ff2d2d'; ctx.fillRect(-4, 0, 6, (W2 - 4) / 2); ctx.fillStyle = '#16233f'; ctx.fillRect(-L / 2 + 2, -W2 / 2, 8, W2); ctx.fillRect(L / 2 - 10, -W2 / 2, 6, W2); }
    }
    ctx.restore();
    if (v.hp < v.maxHp * 0.5 && Math.random() < 0.3) this.part(v.x, v.y, (Math.random() - 0.5) * 20, -30, 0.9, 8, v.burn > 0 ? '#ff7a2a' : 'rgba(40,40,44,0.5)', v.burn > 0 ? 1 : 2);
    if (v.driver && v.f === 0) { ctx.strokeStyle = FACTIONS[0].color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(v.x, v.y, v.r + 12, 0, 6.29); ctx.stroke(); }
    if (v.hp < v.maxHp && v.hp > 0) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(v.x - 20, v.y - v.r - 14, 40, 5); ctx.fillStyle = '#ffd24a'; ctx.fillRect(v.x - 19, v.y - v.r - 13, 38 * v.hp / v.maxHp, 3); }
  }
  buildings(pb: Actor | null, x0: number, y0: number, x1: number, y1: number): void {
    const { ctx, world: w } = this, cx = this.cam.x, cy = this.cam.y, list: number[] = [];
    for (let i = 0; i < w.map.solids.length; i++) { const s = w.map.solids[i]; if (s.alive && s.x < x1 + 60 && s.x + s.w > x0 - 60 && s.y < y1 + 60 && s.y + s.h > y0 - 60) list.push(i); }
    list.sort((p, q) => { const a = w.map.solids[p], b = w.map.solids[q]; return Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy) - Math.hypot(a.x + a.w / 2 - cx, a.y + a.h / 2 - cy); });
    for (const t of w.map.trees) if (this.visible(t.x, t.y)) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(t.x + 5, t.y + 6, t.r, 0, 6.29); ctx.fill(); }
    for (const i of list) {
      const s = w.map.solids[i], st = s.struct ? w.structures.find(q => q.id === s.struct) : undefined, h = s.height * (st && st.built < 1 ? 0.3 + st.built * 0.7 : 1);
      const rx0 = cx + (s.x - cx) * (1 + h), ry0 = cy + (s.y - cy) * (1 + h), rx1 = cx + (s.x + s.w - cx) * (1 + h), ry1 = cy + (s.y + s.h - cy) * (1 + h);
      const hide = pb && pb.x > rx0 - 8 && pb.x < rx1 + 8 && pb.y > ry0 - 8 && pb.y < ry1 + 8;
      ctx.globalAlpha = hide ? 0.3 : st && st.built < 1 ? 0.75 : 1;
      ctx.fillStyle = s.wall;
      const wall = (ax: number, ay: number, bx: number, by: number, cx2: number, cy2: number, dx: number, dy: number, shade: number): void => { ctx.fillStyle = s.wall; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx2, cy2); ctx.lineTo(dx, dy); ctx.fill(); if (shade) { ctx.fillStyle = `rgba(0,0,0,${shade})`; ctx.fill(); } };
      if (cy < s.y) wall(s.x, s.y, s.x + s.w, s.y, rx1, ry0, rx0, ry0, 0.25);
      if (cy > s.y + s.h) wall(s.x, s.y + s.h, s.x + s.w, s.y + s.h, rx1, ry1, rx0, ry1, 0);
      if (cx < s.x) wall(s.x, s.y, s.x, s.y + s.h, rx0, ry1, rx0, ry0, 0.35);
      if (cx > s.x + s.w) wall(s.x + s.w, s.y, s.x + s.w, s.y + s.h, rx1, ry1, rx1, ry0, 0.12);
      ctx.fillStyle = s.roof; ctx.fillRect(rx0, ry0, rx1 - rx0, ry1 - ry0); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(rx0 + 1, ry0 + 1, rx1 - rx0 - 2, ry1 - ry0 - 2);
      const mx = (rx0 + rx1) / 2, my = (ry0 + ry1) / 2, rw = rx1 - rx0, rh = ry1 - ry0;
      if (!st) {
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.strokeRect(rx0 + 9, ry0 + 9, rw - 18, rh - 18);
        ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(rx0 + 16 + (i * 37) % Math.max(1, rw - 60), ry0 + 16 + (i * 53) % Math.max(1, rh - 50), 26, 18); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(rx0 + 20 + (i * 71) % Math.max(1, rw - 54), ry0 + 22 + (i * 29) % Math.max(1, rh - 50), 14, 14);
        if (s.sign) { ctx.font = `900 ${Math.min(34, rw / 4.2)}px 'Noto Sans KR',sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillText(s.sign, mx + 2, my + 2); ctx.fillStyle = s.signColor!; ctx.fillText(s.sign, mx, my); ctx.textBaseline = 'alphabetic'; }
      } else {
        const f = w.factions[st.f]; ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(rx0 + 6, ry0 + 6, rw - 12, rh - 12);
        ctx.font = "800 11px 'Noto Sans KR',sans-serif"; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
        if (st.kind === 'turret') { ctx.save(); ctx.translate(mx, my); ctx.rotate(st.ang); ctx.fillStyle = '#16181c'; ctx.fillRect(0, -3, 30, 6); ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(0, 0, 11, 0, 6.29); ctx.fill(); ctx.restore(); }
        else if (st.kind === 'hq') { ctx.fillStyle = f.color; ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = -1.57 + k * 0.628, r = k % 2 ? 12 : 28; ctx.lineTo(mx + Math.cos(a) * r, my + Math.sin(a) * r); } ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(f.name, mx, ry1 - 12); }
        else ctx.fillText(STRUCTS[st.kind].name, mx, my + 4);
        ctx.globalAlpha = 1;
        if (st.hp < st.maxHp || st.built < 1) { const k = Math.max(0, st.hp / st.maxHp); ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(mx - 30, ry0 - 12, 60, 7); ctx.fillStyle = st.built < 1 ? '#8fe9ff' : st.f === 0 ? '#5dfc9b' : '#ff5d5d'; ctx.fillRect(mx - 29, ry0 - 11, 58 * (st.built < 1 ? st.built : k), 5); }
        if (st.queue.length && st.f === 0) { const q = st.queue[0]; ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(mx - 30, ry1 + 5, 60, 6); ctx.fillStyle = '#ffd24a'; ctx.fillRect(mx - 29, ry1 + 6, 58 * (1 - q.t / q.total), 4); ctx.fillStyle = '#fff'; ctx.fillText(`×${st.queue.length}`, mx + 42, ry1 + 12); }
        if (st.temp > 0) { ctx.fillStyle = '#ffd24a'; ctx.fillText(`${Math.ceil(st.temp)}s`, mx, ry0 - 16); }
      }
      ctx.globalAlpha = 1;
    }
    for (const t of w.map.trees) if (this.visible(t.x, t.y)) { const tx = cx + (t.x - cx) * 1.06, ty = cy + (t.y - cy) * 1.06, hide = pb && Math.hypot(pb.x - tx, pb.y - ty) < t.r; ctx.globalAlpha = hide ? 0.4 : 0.95; ctx.fillStyle = '#2f6b3d'; ctx.beginPath(); ctx.arc(tx, ty, t.r, 0, 6.29); ctx.fill(); ctx.fillStyle = '#3f8a4f'; ctx.beginPath(); ctx.arc(tx - t.r * 0.25, ty - t.r * 0.25, t.r * 0.6, 0, 6.29); ctx.fill(); ctx.globalAlpha = 1; }
  }
  zoneLayer(x0: number, y0: number, x1: number, y1: number): void {
    const { ctx, world: w } = this, z = w.zone; if (z.r > 3000) return;
    ctx.fillStyle = 'rgba(128,64,220,0.3)'; ctx.beginPath(); ctx.rect(x0 - 50, y0 - 50, x1 - x0 + 100, y1 - y0 + 100); ctx.arc(z.x, z.y, Math.max(0, z.r), 0, 6.29, true); ctx.fill('evenodd');
    ctx.strokeStyle = '#c59bff'; ctx.lineWidth = 5; ctx.setLineDash([26, 14]); ctx.lineDashOffset = -this.t * 40; ctx.beginPath(); ctx.arc(z.x, z.y, Math.max(0, z.r), 0, 6.29); ctx.stroke();
    if (z.nr < z.r) { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2.5; ctx.setLineDash([8, 12]); ctx.beginPath(); ctx.arc(z.nx, z.ny, Math.max(2, z.nr), 0, 6.29); ctx.stroke(); }
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }

  /** 미니맵 (size px 정사각형 캔버스에 그림) */
  minimap(c: HTMLCanvasElement, big: boolean, heading: number | null = null): void {
    const w = this.world, g = c.getContext('2d')!, S = c.width, ar = w.map.arena, ox = ar ? ar.x0 : 0, oy = ar ? ar.y0 : 0, span = ar ? ar.x1 - ar.x0 : SIZE, k = S / span;
    if (!this.mini) { // 1대1 전용 맵은 경기장 영역만 잘라 그립니다.
      this.mini = document.createElement('canvas'); this.mini.width = this.mini.height = 520; const m = this.mini.getContext('2d')!, mk = 520 / span;
      m.fillStyle = '#1b1e24'; m.fillRect(0, 0, 520, 520);
      for (const b of w.map.blocks) { if (b.type === 'void') continue; m.fillStyle = b.type === 'park' ? '#27442f' : b.type === 'base' ? '#2f3b3a' : b.type === 'plaza' ? '#4a4e58' : '#343943'; m.fillRect((b.x - ox) * mk, (b.y - oy) * mk, BLOCK * mk, BLOCK * mk); }
      m.fillStyle = '#596170'; for (const s of w.map.solids) if (!s.struct) m.fillRect((s.x - ox) * mk, (s.y - oy) * mk, s.w * mk, s.h * mk);
    }
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(this.mini, 0, 0, S, S); g.setTransform(1, 0, 0, 1, -ox * k, -oy * k);
    for (const c2 of w.crystals) if (c2.amount > 0) { g.fillStyle = '#39c6e8'; g.fillRect(c2.x * k - 1, c2.y * k - 1, 2, 2); }
    for (const z of w.businesses) { g.fillStyle = z.kind === 'gunshop' ? '#ff5d5d' : z.owner >= 0 ? FACTIONS[z.owner].color : '#cfd4da'; const r = big ? 5 : 3; if (z.kind === 'gunshop') { g.fillRect(z.x * k - r, z.y * k - 1, r * 2, 2); g.fillRect(z.x * k - 1, z.y * k - r, 2, r * 2); } else { g.beginPath(); g.arc(z.x * k, z.y * k, r * (z.owner >= 0 ? 1 : 0.7), 0, 6.29); g.fill(); } }
    for (const s of w.structures) if (s.alive) { g.fillStyle = FACTIONS[s.f].color; const r = s.kind === 'hq' ? (big ? 9 : 6) : (big ? 4 : 2.5); g.fillRect((s.x + s.w / 2) * k - r, (s.y + s.h / 2) * k - r, r * 2, r * 2); if (s.kind === 'hq') { g.strokeStyle = '#000'; g.lineWidth = 1; g.strokeRect((s.x + s.w / 2) * k - r, (s.y + s.h / 2) * k - r, r * 2, r * 2); } }
    const pb = w.boss(0);
    for (const a of w.actors) { if (!a.alive || a.f === CIV) continue; if (a.kind === 'boss') continue; if (a.f !== 0 && !(pb && Math.hypot(a.x - pb.x, a.y - pb.y) < 1000)) continue; g.fillStyle = fcolor(a.f); g.fillRect(a.x * k - 1, a.y * k - 1, big ? 3 : 2, big ? 3 : 2); }
    for (const l of w.loot) if (l.alive && l.type === 'crate') { g.fillStyle = '#ffe27a'; g.beginPath(); g.arc(l.x * k, l.y * k, (big ? 7 : 4) + Math.sin(this.t * 6) * 1.5, 0, 6.29); g.fill(); }
    for (const f of w.factions) { const b = w.boss(f.id); if (!b) continue; if (w.opts.duel && f.id !== 0 && pb && !(Math.hypot(b.x - pb.x, b.y - pb.y) < DUEL_RADAR || w.canSee(pb.x, pb.y, b.x, b.y))) continue; g.fillStyle = f.color; g.strokeStyle = f.id === 0 ? '#fff' : '#000'; g.lineWidth = f.id === 0 ? 2 : 1; g.beginPath(); g.arc(b.x * k, b.y * k, f.id === 0 ? (big ? 7 : 5) : (big ? 6 : 4), 0, 6.29); g.fill(); g.stroke(); }
    const z = w.zone; g.fillStyle = 'rgba(128,64,220,0.35)'; g.beginPath(); g.rect(ox * k, oy * k, S, S); g.arc(z.x * k, z.y * k, Math.max(0, z.r * k), 0, 6.29, true); g.fill('evenodd');
    g.strokeStyle = '#c59bff'; g.lineWidth = 2; g.beginPath(); g.arc(z.x * k, z.y * k, Math.max(0, z.r * k), 0, 6.29); g.stroke();
    if (z.nr < z.r) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.setLineDash([4, 4]); g.beginPath(); g.arc(z.nx * k, z.ny * k, Math.max(1, z.nr * k), 0, 6.29); g.stroke(); g.setLineDash([]); }
    if (heading !== null && pb) { g.save(); g.translate(pb.x * k, pb.y * k); g.rotate(heading); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(big ? 16 : 11, 0); g.lineTo(big ? 5 : 3, big ? -6 : -4); g.lineTo(big ? 5 : 3, big ? 6 : 4); g.fill(); g.restore(); }
    else if (!big) { g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1; g.strokeRect((this.cam.x - this.w / 2 / this.cam.zoom) * k, (this.cam.y - this.h / 2 / this.cam.zoom) * k, this.w / this.cam.zoom * k, this.h / this.cam.zoom * k); }
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
}
