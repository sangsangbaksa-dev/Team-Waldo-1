// OUTLAW CITY — 황혼 도시의 방향 회전 레이더와 일시정지용 전체 지도.
import type { CityMap, Poi, PoiKind } from './types';
import type { Sim } from './sim';

const SIZE = 1024;
const POI_STYLE: Record<PoiKind, { icon: string; color: string }> = {
  safehouse: { icon: '⌂', color: '#5dff8f' }, gunshop: { icon: 'G', color: '#ffb84d' },
  paynspray: { icon: 'P', color: '#3df2ff' }, hospital: { icon: '+', color: '#f3f5f6' },
  police: { icon: '★', color: '#3b82ff' }, bank: { icon: '$', color: '#ffd23f' },
  casino: { icon: '◆', color: '#ff3d81' }, garage: { icon: '⚙', color: '#c7d0d3' },
  chopshop: { icon: '⚒', color: '#ff805e' }, club: { icon: '♫', color: '#df70ff' },
  dock: { icon: '⚓', color: '#3df2ff' }, park: { icon: '♣', color: '#78d78c' }, start: { icon: 'M', color: '#ffd23f' },
  dealer: { icon: '🚗', color: '#ffd23f' }, arena: { icon: 'F', color: '#ff4545' },
};
const DISTRICT_KO: Record<string, string> = { downtown: '다운타운', commercial: '상업 지구', residential: '주거 지구', industrial: '공업 지구', park: '공원 지구' };

/** 좌표에 해당하는 도시 지구 이름. */
export function districtName(x: number, z: number, map?: CityMap): string {
  const half = map?.half ?? 600, pitch = map?.pitch ?? 100;
  const ix = Math.max(0, Math.min(11, Math.floor((x + half) / pitch)));
  const iz = Math.max(0, Math.min(11, Math.floor((z + half) / pitch)));
  const park = map?.parks.find(p => Math.abs(x - p.x) < p.w / 2 && Math.abs(z - p.z) < p.d / 2);
  if (park) return DISTRICT_KO.park;
  // 지도 생성 규칙의 구역 구분을 그대로 따라 이름을 붙입니다.
  return DISTRICT_KO[ix < 3 && iz < 3 ? 'industrial' : ix >= 4 && ix <= 6 && iz >= 4 && iz <= 6 ? 'downtown' : ix >= 3 && ix <= 7 && iz >= 3 && iz <= 7 ? 'commercial' : 'residential'];
}

export class Minimap {
  private base: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private range = 180;

  constructor(readonly map: CityMap) {
    this.base = document.createElement('canvas'); this.base.width = this.base.height = SIZE;
    this.ctx = this.base.getContext('2d')!;
    this.paintBase();
  }

  /** 1200m 도시 베이스는 한 번만 래스터화해 프레임 비용을 줄입니다. */
  private paintBase(): void {
    const g = this.ctx, m = this.map, k = SIZE / (m.half * 2), px = (x: number) => (x + m.half) * k;
    g.fillStyle = '#182126'; g.fillRect(0, 0, SIZE, SIZE);
    // 공원은 도로와 건물보다 먼저 칠해 도시의 녹지 덩어리를 읽기 쉽게 합니다.
    for (const p of m.parks) { g.fillStyle = '#294638'; g.fillRect(px(p.x - p.w / 2), px(p.z - p.d / 2), p.w * k, p.d * k); g.strokeStyle = 'rgba(143,213,157,.23)'; g.lineWidth = 1; g.strokeRect(px(p.x - p.w / 2), px(p.z - p.d / 2), p.w * k, p.d * k); }
    // 블록마다 회색 온도를 조금 달리해 지구의 밀도 차이를 드러냅니다.
    const tones: Record<string, string> = { downtown: '#77858a', commercial: '#716f68', residential: '#77716a', industrial: '#656b6b' };
    for (const b of m.buildings) {
      g.fillStyle = tones[b.district] ?? '#747873';
      g.fillRect(px(b.x - b.w / 2), px(b.z - b.d / 2), Math.max(1, b.w * k), Math.max(1, b.d * k));
      g.strokeStyle = 'rgba(220,225,220,.22)'; g.lineWidth = 0.7; g.strokeRect(px(b.x - b.w / 2), px(b.z - b.d / 2), Math.max(1, b.w * k), Math.max(1, b.d * k));
    }
    // 중심선의 실제 폭을 사용해 큰 간선과 골목이 축척에 맞게 보이게 합니다.
    g.lineCap = 'butt';
    for (const r of m.roads) {
      g.strokeStyle = r.major ? '#b7bec0' : '#858e91'; g.lineWidth = Math.max(1, r.width * k);
      g.beginPath(); g.moveTo(px(r.ax), px(r.az)); g.lineTo(px(r.bx), px(r.bz)); g.stroke();
      if (r.major) { g.strokeStyle = 'rgba(255,210,63,.38)'; g.lineWidth = Math.max(.6, .8 * k); g.setLineDash([3, 4]); g.beginPath(); g.moveTo(px(r.ax), px(r.az)); g.lineTo(px(r.bx), px(r.bz)); g.stroke(); g.setLineDash([]); }
    }
    // 주요 장소는 바탕에도 작은 색점으로 남겨 줌인 중 길 찾기를 돕습니다.
    for (const p of m.pois) { g.fillStyle = POI_STYLE[p.kind].color; g.globalAlpha = .78; g.beginPath(); g.arc(px(p.x), px(p.z), p.kind === 'start' ? 3 : 2.5, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
  }

  /** HUD 의 둥근 미니맵: 카메라 방향이 위, 도보 180m에서 속도에 따라 320m까지 줌아웃. */
  draw(canvas: HTMLCanvasElement, sim: Sim, camYaw: number): void {
    const g = canvas.getContext('2d'); if (!g) return;
    const w = canvas.width, h = canvas.height, size = Math.min(w, h), cx = w / 2, cy = h / 2, p = sim.player;
    const v = p.vehicle ? sim.vehicle(p.vehicle) : undefined, speed = v ? Math.abs(v.vf) : 0;
    const target = v ? 180 + Math.min(140, speed * 2.2) : 180;
    this.range += (target - this.range) * .08;
    const k = size / (this.range * 2), angle = -camYaw - Math.PI / 2, c = Math.cos(angle), s = Math.sin(angle);
    const point = (x: number, z: number): [number, number] => { const dx = x - p.x, dz = z - p.z; return [cx + (dx * c - dz * s) * k, cy + (dx * s + dz * c) * k]; };
    g.clearRect(0, 0, w, h); g.save(); g.beginPath(); g.arc(cx, cy, size * .47, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#11191e'; g.fillRect(cx - size / 2, cy - size / 2, size, size);
    g.translate(cx, cy); g.rotate(angle); g.translate(-p.x * k, -p.z * k); g.drawImage(this.base, -this.map.half * k, -this.map.half * k, this.map.half * 2 * k, this.map.half * 2 * k); g.restore();
    g.save(); g.beginPath(); g.arc(cx, cy, size * .47, 0, Math.PI * 2); g.clip();
    const r = this.range;
    for (const poi of this.map.pois) if (Math.abs(poi.x - p.x) < r && Math.abs(poi.z - p.z) < r) this.poi(g, point(poi.x, poi.z), poi, size * .046);
    for (const marker of [...sim.mission.markers, ...sim.activity.markers, ...sim.job.markers]) if (marker.blip) {
      const [x, y] = point(marker.x, marker.z), dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy), edge = size * .405;
      if (d > edge) { const a = Math.atan2(dy, dx); g.save(); g.translate(cx + Math.cos(a) * edge, cy + Math.sin(a) * edge); g.rotate(a); g.fillStyle = markerColor(marker.color, marker.kind); g.beginPath(); g.moveTo(8, 0); g.lineTo(-5, -4); g.lineTo(-3, 0); g.lineTo(-5, 4); g.closePath(); g.fill(); g.restore(); }
      else { g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillStyle = markerColor(marker.color, marker.kind); g.fillRect(-4, -4, 8, 8); g.restore(); }
    }
    const wanted = sim.wanted.stars > 0, blink = Math.floor(sim.t * 4) % 2 === 0;
    if (wanted) {
      for (const cop of sim.peds) if (cop.alive && cop.team === 'cop' && Math.abs(cop.x - p.x) < r && Math.abs(cop.z - p.z) < r) { const [x, y] = point(cop.x, cop.z); this.dot(g, x, y, blink ? '#3b82ff' : '#ff4545', 3.1); }
      for (const car of sim.vehicles) if (car.alive && car.kind === 'police' && Math.abs(car.x - p.x) < r && Math.abs(car.z - p.z) < r) { const [x, y] = point(car.x, car.z); this.dot(g, x, y, blink ? '#3b82ff' : '#ff4545', 4.4); }
    } else {
      for (const cop of sim.peds) if (cop.alive && cop.team === 'cop' && (cop.mode === 'chase' || cop.mode === 'attack') && Math.abs(cop.x - p.x) < r && Math.abs(cop.z - p.z) < r) { const [x, y] = point(cop.x, cop.z); this.dot(g, x, y, '#3b82ff', 3); }
    }
    for (const id of Object.values(sim.mission.ids)) {
      const ped = sim.peds.find(q => q.id === id && q.alive), car = sim.vehicles.find(q => q.id === id && q.alive);
      const x = ped?.x ?? car?.x, z = ped?.z ?? car?.z;
      if (x !== undefined && z !== undefined && Math.abs(x - p.x) < r && Math.abs(z - p.z) < r) { const q = point(x, z); this.dot(g, q[0], q[1], '#ff4545', 3.5); }
    }
    g.restore();
    // 플레이어 방향은 카메라 기준 고정 화살표여서 조작 중 방향 감각이 흔들리지 않습니다.
    g.save(); g.translate(cx, cy); g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,.85)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -size * .055); g.lineTo(size * .035, size * .035); g.lineTo(0, size * .02); g.lineTo(-size * .035, size * .035); g.closePath(); g.fill(); g.stroke(); g.restore();
    g.font = `700 ${Math.max(9, size * .065)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f3f5f6'; g.shadowColor = '#101619'; g.shadowBlur = 3; g.fillText('N', cx, cy - size * .405); g.shadowBlur = 0;
    g.strokeStyle = 'rgba(223,232,231,.8)'; g.lineWidth = Math.max(1.5, size * .009); g.beginPath(); g.arc(cx, cy, size * .47, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(8,13,16,.78)'; g.fillRect(cx - size * .32, cy + size * .37, size * .64, size * .075);
    g.font = `600 ${Math.max(8, size * .034)}px sans-serif`; g.fillStyle = '#c4d0d1'; g.fillText(districtName(p.x, p.z, this.map), cx, cy + size * .408);
  }

  /** 일시정지 지도는 북쪽 위 고정, POI 이름·좌표 그리드·범례를 표시합니다. */
  drawFull(canvas: HTMLCanvasElement, sim: Sim, _camYaw: number): void {
    const g = canvas.getContext('2d'); if (!g) return;
    const w = canvas.width, h = canvas.height, side = Math.min(w * .88, h * .82), left = (w - side) / 2, top = (h - side) / 2 - h * .035;
    const k = side / (this.map.half * 2), px = (x: number) => left + (x + this.map.half) * k, pz = (z: number) => top + (z + this.map.half) * k;
    g.clearRect(0, 0, w, h); g.fillStyle = '#11191e'; g.fillRect(0, 0, w, h);
    g.drawImage(this.base, left, top, side, side);
    g.save(); g.beginPath(); g.rect(left, top, side, side); g.clip();
    g.strokeStyle = 'rgba(207,220,221,.18)'; g.lineWidth = Math.max(1, side / 700); g.setLineDash([4 * k, 4 * k]);
    for (let i = 0; i < 12; i++) { const x = -this.map.half + i * this.map.pitch + this.map.pitch / 2, z = x; g.beginPath(); g.moveTo(px(x), top); g.lineTo(px(x), top + side); g.stroke(); g.beginPath(); g.moveTo(left, pz(z)); g.lineTo(left + side, pz(z)); g.stroke(); }
    g.setLineDash([]);
    const font = Math.max(8, Math.min(13, side * .018)); g.font = `700 ${font}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#d6dedf';
    for (let i = 0; i < 12; i++) { g.fillText(String.fromCharCode(65 + i), px(-this.map.half + (i + .5) * this.map.pitch), top - font * 1.2); g.fillText(String(i + 1), left - font * 1.2, pz(-this.map.half + (i + .5) * this.map.pitch)); }
    for (const poi of this.map.pois) {
      const x = px(poi.x), y = pz(poi.z); this.poi(g, [x, y], poi, font * 1.7);
      g.font = `600 ${font}px sans-serif`; g.lineWidth = 3; g.strokeStyle = 'rgba(12,17,20,.9)'; g.strokeText(poi.name, x, y + font * 1.8); g.fillStyle = '#f1f3ef'; g.fillText(poi.name, x, y + font * 1.8);
    }
    for (const marker of [...sim.mission.markers, ...sim.activity.markers, ...sim.job.markers]) if (marker.blip) { g.save(); g.translate(px(marker.x), pz(marker.z)); g.rotate(Math.PI / 4); g.fillStyle = markerColor(marker.color, marker.kind); g.fillRect(-font * .65, -font * .65, font * 1.3, font * 1.3); g.restore(); }
    if (sim.wanted.stars > 0) {
      const color = Math.floor(sim.t * 4) % 2 ? '#3b82ff' : '#ff4545';
      for (const cop of sim.peds) if (cop.alive && cop.team === 'cop') this.dot(g, px(cop.x), pz(cop.z), color, font * .48);
      for (const car of sim.vehicles) if (car.alive && car.kind === 'police') this.dot(g, px(car.x), pz(car.z), color, font * .7);
    }
    for (const id of Object.values(sim.mission.ids)) { const ped = sim.peds.find(q => q.id === id && q.alive), car = sim.vehicles.find(q => q.id === id && q.alive); if (ped) this.dot(g, px(ped.x), pz(ped.z), '#ff4545', font * .55); else if (car) this.dot(g, px(car.x), pz(car.z), '#ff4545', font * .55); }
    const p = sim.player, x = px(p.x), y = pz(p.z); g.save(); g.translate(x, y); g.rotate(Math.PI / 2 + p.yaw); g.fillStyle = '#fff'; g.strokeStyle = '#101619'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -font * 1.1); g.lineTo(font * .7, font * .7); g.lineTo(0, font * .3); g.lineTo(-font * .7, font * .7); g.closePath(); g.fill(); g.stroke(); g.restore();
    g.restore(); g.strokeStyle = '#aeb9bb'; g.lineWidth = 1.5; g.strokeRect(left, top, side, side);
    this.drawLegend(g, left, top + side + h * .045, w, font);
  }

  private poi(g: CanvasRenderingContext2D, pos: [number, number], poi: Poi, size: number): void {
    const [x, y] = pos, st = POI_STYLE[poi.kind]; g.save(); g.translate(x, y);
    g.fillStyle = 'rgba(9,15,18,.9)'; g.beginPath(); g.arc(0, 0, size * .72, 0, Math.PI * 2); g.fill();
    g.strokeStyle = st.color; g.lineWidth = Math.max(1, size * .1); g.beginPath(); g.arc(0, 0, size * .62, 0, Math.PI * 2); g.stroke();
    g.fillStyle = st.color; g.font = `800 ${size}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(st.icon, 0, 0); g.restore();
  }
  private dot(g: CanvasRenderingContext2D, x: number, y: number, color: string, r: number): void { g.fillStyle = color; g.strokeStyle = 'rgba(8,12,15,.9)'; g.lineWidth = Math.max(1, r * .35); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke(); }
  private drawLegend(g: CanvasRenderingContext2D, left: number, y: number, w: number, font: number): void {
    const items: Array<[string, string]> = [['⌂ 안전가옥', '#5dff8f'], ['G 총기점', '#ffb84d'], ['+ 병원', '#f3f5f6'], ['P 도색소', '#3df2ff'], ['M 의뢰', '#ffd23f'], ['경찰', '#3b82ff']];
    g.font = `600 ${font}px sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle';
    const gap = Math.max(64, (w - left * 2) / items.length); items.forEach(([label, color], i) => { const x = left + i * gap; g.fillStyle = color; g.beginPath(); g.arc(x + font * .45, y, font * .34, 0, Math.PI * 2); g.fill(); g.fillStyle = '#d5dddd'; g.fillText(label, x + font, y); });
  }
}

function markerColor(color: number, kind: string): string {
  if (kind === 'target') return '#ff4545';
  if (kind === 'item') return '#3df2ff';
  if (color === 0xff4545 || color === 0xff0000) return '#ff4545';
  if (color === 0x3df2ff || color === 0x00ffff) return '#3df2ff';
  return '#ffd23f';
}
