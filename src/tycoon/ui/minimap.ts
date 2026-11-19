// TYCOON — 미니맵/전체 지도. 북쪽이 위, 구역별 색, 잠긴 구획은 어둡게.
import { DISTRICTS } from '../core/data';
import { BLOCK, WORLD_HALF, blockUnlocked, type Layout, type Zone } from '../scene/layout';
import { spotColor, type SpotView } from '../scene/city';

const ZONE_COLOR: Record<Zone, string> = { slum: '#8b6f55', market: '#c98a3b', harbor: '#3f8aa6', downtown: '#6f78c4', uptown: '#b865a8', fringe: '#566070' };
export const zoneName = (z: Zone): string => (z === 'fringe' ? '외곽' : DISTRICTS[z].name);

export interface MapView { stage: number; spots: SpotView[]; px: number; pz: number; yaw: number; target: string | null; time: number; names: boolean }

export function drawMap(canvas: HTMLCanvasElement, layout: Layout, v: MapView): void {
  const g = canvas.getContext('2d'); if (!g) return;
  const W = canvas.width, S = W / (WORLD_HALF * 2), X = (x: number): number => (x + WORLD_HALF) * S, Z = (z: number): number => (z + WORLD_HALF) * S;
  g.clearRect(0, 0, W, W); g.fillStyle = 'rgba(12,16,22,.92)'; g.fillRect(0, 0, W, W);
  for (const b of layout.blocks) {
    const on = blockUnlocked(b, v.stage); g.globalAlpha = on ? 0.95 : 0.28; g.fillStyle = ZONE_COLOR[b.zone];
    g.fillRect(X(b.cx - BLOCK / 2), Z(b.cz - BLOCK / 2), BLOCK * S, BLOCK * S);
    if (!on) { g.globalAlpha = 0.5; g.strokeStyle = '#0c1016'; g.lineWidth = Math.max(1, S * 2); g.beginPath(); g.moveTo(X(b.cx - 15), Z(b.cz - 15)); g.lineTo(X(b.cx + 15), Z(b.cz + 15)); g.stroke(); }
  }
  g.globalAlpha = 1;
  for (const s of v.spots) {
    const l = layout.spotLots.get(s.id); if (!l || !blockUnlocked(l.block, v.stage)) continue;
    const x = X(l.doorX), z = Z(l.doorZ), r = Math.max(2.2, S * (v.names ? 3.2 : 4.4)), target = v.target === s.id;
    g.fillStyle = s.locked ? '#6b727c' : spotColor(s); g.beginPath(); g.arc(x, z, target ? r * 1.6 + Math.sin(v.time * 6) * r * 0.3 : r, 0, 7); g.fill();
    g.strokeStyle = target ? '#fff' : 'rgba(0,0,0,.6)'; g.lineWidth = target ? 2 : 1; g.stroke();
    if (v.names) { g.font = `600 ${Math.max(9, S * 6)}px system-ui,sans-serif`; g.fillStyle = s.locked ? '#9aa1ab' : '#fff'; g.textAlign = 'center'; g.shadowColor = '#000'; g.shadowBlur = 4; g.fillText(s.name, x, z - r - 3); g.shadowBlur = 0; }
  }
  if (v.names) { g.font = `800 ${Math.max(12, S * 9)}px system-ui,sans-serif`; g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,.55)'; for (const b of layout.blocks) if ((b.i === -3 && b.j === 3) || (b.i === -1 && b.j === 2) || (b.i === 2 && b.j === 3) || (b.i === 0 && b.j === 0) || (b.i === 3 && b.j === -2)) g.fillText(zoneName(b.zone), X(b.cx), Z(b.cz)); }
  // 플레이어 화살표(바라보는 방향)
  const px = X(v.px), pz = Z(v.pz); g.save(); g.translate(px, pz); g.rotate(-v.yaw + Math.PI / 2);
  const a = Math.max(6, S * 7); g.fillStyle = '#fff'; g.strokeStyle = '#111'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(a, 0); g.lineTo(-a * 0.7, a * 0.7); g.lineTo(-a * 0.35, 0); g.lineTo(-a * 0.7, -a * 0.7); g.closePath(); g.fill(); g.stroke(); g.restore();
}
