import { METROPOLIS } from './world';
import type { Match, Player } from './sim';
import type { ReconMark } from './recon';

/** 3D 시뮬레이션과 독립적인 2D 지도 및 나침반 표시. */
export class ShooterNavigation {
  private mapBase: HTMLCanvasElement | null = null;
  private readonly mapCtx: CanvasRenderingContext2D;
  private readonly compassCtx: CanvasRenderingContext2D;

  constructor(private readonly mapCv: HTMLCanvasElement, private readonly compassCv: HTMLCanvasElement) {
    const mapCtx = mapCv.getContext('2d'), compassCtx = compassCv.getContext('2d');
    if (!mapCtx || !compassCtx) throw new Error('ZERO ZONE navigation canvas unavailable');
    this.mapCtx = mapCtx;
    this.compassCtx = compassCtx;
  }

  reset(): void { this.mapBase = null; }

  draw(match: Match, player: Player, reconMarks: readonly ReconMark[] = []): void {
    this.drawMap(match, player, reconMarks);
    this.drawCompass(match, player);
  }

  private drawMap(m: Match, p: Player, marks: readonly ReconMark[]): void {
    const S = this.mapCv.width, half = m.map.half, k = S / (half * 2), px = (x: number): number => (x + half) * k, pz = (z: number): number => (z + half) * k, g = this.mapCtx;
    if (!this.mapBase) {
      this.mapBase = document.createElement('canvas'); this.mapBase.width = this.mapBase.height = S; const b = this.mapBase.getContext('2d')!;
      b.fillStyle = '#26301f'; b.fillRect(0, 0, S, S); b.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 1; i < 8; i++) { b.fillRect((S / 8) * i, 0, 1, S); b.fillRect(0, (S / 8) * i, S, 1); }
      { // 지형: 숲·구릉·절벽·물
        const t = m.map.terrain; b.fillStyle = 'rgba(40,75,35,.75)'; for (const f of t.forests) { b.beginPath(); b.arc(px(f.x), pz(f.z), f.r * k, 0, Math.PI * 2); b.fill(); }
        // 완만한 능선은 등고선으로 표시하고, 오를 수 없는 암벽과 색을 구분합니다.
        for (const rise of t.rises) {
          const x = px(rise.x), z = pz(rise.z), radius = rise.r * k;
          const grad = b.createRadialGradient(x, z, 0, x, z, radius);
          grad.addColorStop(0, 'rgba(164,157,119,.67)'); grad.addColorStop(0.65, 'rgba(129,145,88,.35)'); grad.addColorStop(1, 'rgba(129,145,88,0)');
          b.fillStyle = grad; b.beginPath(); b.arc(x, z, radius, 0, Math.PI * 2); b.fill();
          b.strokeStyle = 'rgba(203,202,151,.45)'; b.lineWidth = 0.75;
          for (const fraction of [0.48, 0.75]) { b.beginPath(); b.arc(x, z, radius * fraction, 0, Math.PI * 2); b.stroke(); }
        }
        b.fillStyle = '#6d6a60'; for (const h of t.hills) { b.beginPath(); b.arc(px(h.x), pz(h.z), h.r * k, 0, Math.PI * 2); b.fill(); } for (const c of t.cliffs) b.fillRect(px(c.x0), pz(c.z0), Math.max(2, (c.x1 - c.x0) * k), Math.max(2, (c.z1 - c.z0) * k));
        for (const p of t.ponds) { b.fillStyle = p.swamp ? '#59693a' : '#3a78a0'; b.beginPath(); b.ellipse(px(p.x), pz(p.z), p.rx * k, p.rz * k, p.ry, 0, Math.PI * 2); b.fill(); }
        b.strokeStyle = '#3a78a0'; b.lineWidth = Math.max(2, 9 * k); b.lineJoin = 'round'; for (const r of t.rivers) { b.beginPath(); r.pts.forEach(([x, z], i) => (i ? b.lineTo(px(x), pz(z)) : b.moveTo(px(x), pz(z)))); b.stroke(); }
        b.strokeStyle = '#a07a45'; b.lineWidth = 2; for (const br of t.bridges) { b.beginPath(); b.moveTo(px(br.x - Math.cos(br.ry) * br.len / 2), pz(br.z - Math.sin(br.ry) * br.len / 2)); b.lineTo(px(br.x + Math.cos(br.ry) * br.len / 2), pz(br.z + Math.sin(br.ry) * br.len / 2)); b.stroke(); }
      }
      const tint = { urban: '#a9a69b', industrial: '#7b8085', military: '#8a8466', farm: '#a08f6c', village: '#9a9588' } as const;
      for (const c of m.map.compounds) { b.fillStyle = 'rgba(255,255,255,.07)'; b.beginPath(); b.arc(px(c.x), pz(c.z), c.r * k, 0, Math.PI * 2); b.fill(); }
      // 고층 도심을 일반 마을보다 알아보기 쉽게: 실제 블록 사이의 거리망을 지도에도 표시합니다.
      const city = m.map.compounds.find(c => c.downtown);
      if (city) {
        const { cols, rows, lotW, lotD, streetWidth } = METROPOLIS;
        b.strokeStyle = '#434c54'; b.lineWidth = Math.max(1.2, streetWidth * k); b.beginPath();
        for (let i = 1; i < cols; i++) { const x = city.x + (i - cols / 2) * lotW; b.moveTo(px(x), pz(city.z - rows * lotD / 2)); b.lineTo(px(x), pz(city.z + rows * lotD / 2)); }
        for (let j = 1; j < rows; j++) { const z0 = city.z + (j - rows / 2) * lotD; b.moveTo(px(city.x - cols * lotW / 2), pz(z0)); b.lineTo(px(city.x + cols * lotW / 2), pz(z0)); }
        b.stroke();
      }
      for (const bd of m.map.buildings) { const c = m.map.compounds.find(o => Math.hypot(o.x - bd.x, o.z - bd.z) < o.r); b.fillStyle = bd.h >= 16 ? '#c3d1d8' : c ? tint[c.theme] : '#8f8c80'; b.fillRect(px(bd.x - bd.w / 2), pz(bd.z - bd.d / 2), Math.max(3, bd.w * k), Math.max(3, bd.d * k)); }
      b.fillStyle = '#5b5f66'; for (const pr of m.map.props) if (pr.kind === 'container') b.fillRect(px(pr.x) - 1.5, pz(pr.z) - 1, 3, 2);
      b.font = '10px sans-serif'; b.textAlign = 'center'; for (const c of m.map.compounds) { b.fillStyle = c.downtown ? '#ffe2a0' : 'rgba(255,255,255,.55)'; b.font = c.downtown ? 'bold 11px sans-serif' : '10px sans-serif'; b.fillText(c.name, px(c.x), pz(c.z) - c.r * k - 3); }
      b.fillStyle = '#3d5a2c'; for (const t of m.map.trees) b.fillRect(px(t.x) - 1, pz(t.z) - 1, 2, 2);
    }
    const z = m.zone; g.clearRect(0, 0, S, S); g.drawImage(this.mapBase, 0, 0);
    g.save(); g.beginPath(); g.rect(0, 0, S, S); g.arc(px(z.cx), pz(z.cz), z.r * k, 0, Math.PI * 2, true); g.fillStyle = 'rgba(40,110,255,.30)'; g.fill('evenodd'); g.restore();
    g.strokeStyle = '#6fb2ff'; g.lineWidth = 2; g.beginPath(); g.arc(px(z.cx), pz(z.cz), z.r * k, 0, Math.PI * 2); g.stroke();
    if (z.nextR < z.r - 0.5) { g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; g.beginPath(); g.arc(px(z.nextCx), pz(z.nextCz), z.nextR * k, 0, Math.PI * 2); g.stroke(); }
    for (const r of m.reds) if (r.called && m.t < r.end + 2) { g.fillStyle = 'rgba(255,40,30,.3)'; g.beginPath(); g.arc(px(r.x), pz(r.z), r.r * k, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#ff4a3a'; g.lineWidth = 2; g.stroke(); }
    for (const v of m.vehicles) if (!v.wreck && v.driver < 0 && Math.hypot(v.x - p.x, v.z - p.z) < 140) { g.fillStyle = '#7ee0ff'; g.strokeStyle = '#000'; g.lineWidth = 1; g.fillRect(px(v.x) - 2.5, pz(v.z) - 2.5, 5, 5); g.strokeRect(px(v.x) - 2.5, pz(v.z) - 2.5, 5, 5); }
    if (m.plane && m.t < m.plane.end + 10) {
      const pl = m.plane, a = { x: pl.x0, z: pl.z0 }, b = { x: pl.x0 + pl.dx * pl.len, z: pl.z0 + pl.dz * pl.len }, at = m.planeAt(m.t);
      g.save(); g.strokeStyle = 'rgba(255,211,77,.85)'; g.lineWidth = 2; g.setLineDash([7, 5]); g.beginPath(); g.moveTo(px(a.x), pz(a.z)); g.lineTo(px(b.x), pz(b.z)); g.stroke(); g.setLineDash([]);
      g.translate(px(at.x), pz(at.z)); g.rotate(Math.atan2(pl.dz, pl.dx)); g.fillStyle = '#ffd34d'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(9, 0); g.lineTo(-6, -7); g.lineTo(-3, 0); g.lineTo(-6, 7); g.closePath(); g.fill(); g.stroke(); g.restore();
    }
    for (const d of m.drops) if (d.called && m.t < d.at + 150) { const x = px(d.x), y = pz(d.z), pulse = 6 + Math.sin(m.t * 5) * 1.5; g.fillStyle = '#ffd34d'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y - pulse); g.lineTo(x + pulse, y); g.lineTo(x, y + pulse); g.lineTo(x - pulse, y); g.closePath(); g.fill(); g.stroke(); }
    for (const mark of marks) {
      if (mark.expires <= m.t || !m.players[mark.id]?.alive) continue;
      const fade = Math.min(1, (mark.expires - m.t) / 2), x = px(mark.x), y = pz(mark.z);
      g.save(); g.globalAlpha = fade; g.strokeStyle = '#e0c28d'; g.lineWidth = 1.8;
      g.beginPath(); g.arc(x, y, 5.5, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(x - 8, y); g.lineTo(x - 4, y); g.moveTo(x + 4, y); g.lineTo(x + 8, y); g.moveTo(x, y - 8); g.lineTo(x, y - 4); g.moveTo(x, y + 4); g.lineTo(x, y + 8); g.stroke(); g.restore();
    }
    for (const s of m.sounds) { if (s.quiet || s.by === p.id || m.t - s.t > 1.6) continue; const d = Math.hypot(s.x - p.x, s.z - p.z); if (d > 110) continue; g.fillStyle = `rgba(255,70,60,${1 - (m.t - s.t) / 1.6})`; g.beginPath(); g.arc(px(s.x), pz(s.z), 5, 0, Math.PI * 2); g.fill(); }
    g.save(); g.translate(px(p.x), pz(p.z)); g.rotate(p.yaw); g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.moveTo(10, 0); g.lineTo(-7, -6); g.lineTo(-4, 0); g.lineTo(-7, 6); g.closePath(); g.stroke(); g.fill(); g.restore();
  }

  /** 위쪽 나침반: 방위(N·E·S·W)와 자기장 중심·보급 상자 방향을 띄웁니다. 시야 앞뒤 ±65° 를 보여 줍니다. */
  private drawCompass(m: Match, p: Player): void {
    const g = this.compassCtx, W = this.compassCv.width, Hh = this.compassCv.height, span = 65, per = W / (span * 2), D = 180 / Math.PI;
    const bearing = (dx: number, dz: number): number => Math.atan2(dx, -dz) * D, head = bearing(Math.cos(p.yaw), Math.sin(p.yaw)), at = (b: number): number => { let d = b - head; d = ((d + 540) % 360) - 180; return W / 2 + d * per; };
    g.clearRect(0, 0, W, Hh); g.fillStyle = 'rgba(10,12,14,.5)'; g.fillRect(0, 0, W, Hh); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 13px sans-serif';
    for (let b = 0; b < 360; b += 15) {
      const x = at(b); if (x < 0 || x > W) continue; const card = b % 90 === 0; g.fillStyle = card ? '#fff' : 'rgba(255,255,255,.55)';
      if (card) g.fillText(({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' } as Record<number, string>)[b], x, 12); else g.fillRect(x - 0.5, b % 45 === 0 ? 4 : 8, 1, b % 45 === 0 ? 14 : 8);
      if (b % 45 === 0 && !card) { g.font = '10px sans-serif'; g.fillText(String(b), x, 12); g.font = '700 13px sans-serif'; }
    }
    const z = m.zone, mark = (x: number, zz: number, color: string): void => { const b = bearing(x - p.x, zz - p.z), px = Math.max(8, Math.min(W - 8, at(b))); g.fillStyle = color; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(px, 20); g.lineTo(px + 6, 27); g.lineTo(px, 33); g.lineTo(px - 6, 27); g.closePath(); g.fill(); g.stroke(); };
    mark(z.nextR < z.r - 0.5 ? z.nextCx : z.cx, z.nextR < z.r - 0.5 ? z.nextCz : z.cz, '#6fb2ff');
    for (const d of m.drops) if (d.called && !d.landed) mark(d.x, d.z, '#ffd34d');
    g.fillStyle = '#ff5a3c'; g.beginPath(); g.moveTo(W / 2, 20); g.lineTo(W / 2 + 5, 14); g.lineTo(W / 2 - 5, 14); g.closePath(); g.fill();
  }
}
