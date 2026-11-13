import type { War } from './war';
import { mapDefinitionFor, outpostName } from './maps';
import { BIOME_PALETTES } from './biomes';
import { getBattlefieldFeatures } from './battlefieldLayout';
import { worldToMinimap } from './mapCommands';
import { squadDestination, squadOf, type SquadId } from './squads';

const FACTION_COLORS = ['#65dfca', '#f77f8f', '#f5c45d', '#ba9df6'];
const SQUAD_COLORS = ['#65dfca', '#f7d28e', '#c8b1ff'];
export interface StrategicMapOptions {
  size: number;
  selectedSquad: SquadId;
  labels?: boolean;
  selectedPoint?: { x: number; z: number } | null;
  viewport?: ReadonlyArray<{ x: number; z: number }>;
}

/** Both map surfaces use the same coordinates and the same live simulation state. */
export function drawStrategicMap(ctx: CanvasRenderingContext2D, war: War, options: StrategicMapOptions): void {
  const { size, selectedSquad } = options;
  const map = mapDefinitionFor(war), palette = BIOME_PALETTES[map.biome];
  const point = (x: number, z: number) => worldToMinimap(x, z, size, war.mapId);
  const extent = size / (map.halfSize * 2);
  const scale = size / 220;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = palette.minimap; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = palette.minimapLand;
  ctx.beginPath(); ctx.arc(size / 2, size / 2, war.zone * extent, 0, Math.PI * 2); ctx.fill();

  // Roads and solid footprints make the atlas useful for planning a route.
  ctx.strokeStyle = '#d0dfdf16'; ctx.lineWidth = Math.max(1, scale * .65);
  const links = new Set<string>();
  for (const post of war.outposts) {
    const nearest = war.outposts.filter(other => other.id !== post.id)
      .sort((a, b) => Math.hypot(a.x - post.x, a.z - post.z) - Math.hypot(b.x - post.x, b.z - post.z)).slice(0, 2);
    for (const other of nearest) {
      const key = [post.id, other.id].sort((a, b) => a - b).join(':');
      if (links.has(key)) continue; links.add(key);
      const a = point(post.x, post.z), b = point(other.x, other.z);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }
  ctx.fillStyle = '#06131c50';
  for (const feature of getBattlefieldFeatures(war.mapId)) {
    if (feature.radius < 2) continue;
    const p = point(feature.x, feature.z), radius = Math.max(.7, feature.radius * extent);
    ctx.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2);
  }
  ctx.strokeStyle = '#c4dfe312'; ctx.lineWidth = 1;
  for (let i = 1; i < 10; i++) {
    const value = Math.round(size * i / 10) + .5;
    ctx.beginPath(); ctx.moveTo(value, 0); ctx.lineTo(value, size); ctx.moveTo(0, value); ctx.lineTo(size, value); ctx.stroke();
  }
  ctx.strokeStyle = '#a7e3f2b0'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(size / 2, size / 2, war.zone * extent, 0, Math.PI * 2); ctx.stroke();

  for (const squad of [0, 1, 2] as SquadId[]) {
    const goal = squadDestination(war, squad), units = war.units.filter(unit => unit.owner === 0 && unit.hp > 0 && squadOf(unit) === squad);
    if (!goal || !units.length) continue;
    const origin = units.reduce((sum, unit) => ({ x: sum.x + unit.x / units.length, z: sum.z + unit.z / units.length }), { x: 0, z: 0 });
    const a = point(origin.x, origin.z), b = point(goal.x, goal.z);
    ctx.strokeStyle = SQUAD_COLORS[squad]; ctx.lineWidth = squad === selectedSquad ? 1.7 : 1;
    ctx.setLineDash([3 * scale, 3 * scale]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(b.x, b.y, (squad === selectedSquad ? 5 : 3) * scale, 0, Math.PI * 2); ctx.stroke();
  }
  for (const unit of war.units) {
    if (unit.hp <= 0) continue;
    const p = point(unit.x, unit.z), selected = unit.owner === 0 && squadOf(unit) === selectedSquad;
    ctx.fillStyle = unit.owner === 0 ? SQUAD_COLORS[squadOf(unit)] : FACTION_COLORS[unit.owner];
    const dot = Math.max(1.2, (selected ? 2.2 : 1.4) * scale);
    ctx.fillRect(p.x - dot / 2, p.y - dot / 2, dot, dot);
  }

  for (const post of war.outposts) {
    const p = point(post.x, post.z), radius = Math.max(3, 3 * scale);
    ctx.fillStyle = post.owner === null ? '#e4d5b1' : FACTION_COLORS[post.owner];
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4);
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2); ctx.restore();
    if (post.contender !== null && post.progress > 0) {
      ctx.strokeStyle = FACTION_COLORS[post.contender]; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, radius + 4, -Math.PI / 2, -Math.PI / 2 + post.progress / 100 * Math.PI * 2); ctx.stroke();
    }
    if (options.labels) {
      ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const name = outpostName(war, post.id);
      const labelWidth = ctx.measureText(name).width + 8;
      const labelX = Math.min(size - labelWidth / 2 - 2, Math.max(labelWidth / 2 + 2, p.x));
      ctx.fillStyle = '#0a1622c9'; ctx.fillRect(labelX - labelWidth / 2, p.y + radius + 4, labelWidth, 16);
      ctx.fillStyle = '#deeaec'; ctx.fillText(name, labelX, p.y + radius + 6);
    }
  }
  for (const faction of war.factions) {
    const p = point(faction.x, faction.z), radius = 5 * scale;
    ctx.fillStyle = faction.alive ? FACTION_COLORS[faction.id] : '#687984'; ctx.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2);
    if (faction.id === 0) { ctx.strokeStyle = '#e9ffff'; ctx.lineWidth = 1.5; ctx.strokeRect(p.x - radius - 3, p.y - radius - 3, radius * 2 + 6, radius * 2 + 6); }
    if (options.labels) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.font = 'bold 11px system-ui, sans-serif'; ctx.fillStyle = '#f0f7f6';
      ctx.fillText(faction.id === 0 ? '내 본부' : `${['', '적색', '황색', '보라'][faction.id]} 본부`, p.x, p.y - radius - 5);
    }
  }
  if (options.viewport && options.viewport.length >= 3) {
    ctx.strokeStyle = '#edf9f3b3'; ctx.fillStyle = '#edf9f309'; ctx.lineWidth = 1;
    ctx.beginPath();
    options.viewport.forEach((position, index) => { const p = point(position.x, position.z); if (index === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  if (options.selectedPoint) {
    const p = point(options.selectedPoint.x, options.selectedPoint.z);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 10 * scale, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.x - 15 * scale, p.y); ctx.lineTo(p.x + 15 * scale, p.y); ctx.moveTo(p.x, p.y - 15 * scale); ctx.lineTo(p.x, p.y + 15 * scale); ctx.stroke();
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = `${Math.max(9, 9 * scale)}px ui-monospace, monospace`; ctx.fillStyle = '#c5e0e9b3';
  ctx.fillText('N ↑', 8, 8);
}
