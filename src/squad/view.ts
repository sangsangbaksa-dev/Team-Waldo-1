import { UNITS } from './units';
import type { Battle, Placement, Side } from './sim';
export function draw(canvas: HTMLCanvasElement, armies: Placement[][], side: Side, battle: Battle | null, selectedRange: number, hover: { x: number; y: number } | null): void {
  const ctx = canvas.getContext('2d')!; const w = canvas.width, h = canvas.height, cw = w / 20, ch = h / 12;
  ctx.save();
  if (battle && battle.effects.some(e => e.kind === 'siege' && e.age < .12) && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) ctx.translate(Math.sin(battle.tick * 3) * 3, Math.cos(battle.tick * 4) * 2);
  ctx.fillStyle = '#111b29'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#15283a'; ctx.fillRect(0, 0, w / 2, h); ctx.fillStyle = '#321d29'; ctx.fillRect(w / 2, 0, w / 2, h);
  ctx.strokeStyle = '#ffffff0d'; ctx.lineWidth = 1;
  for (let x = 0; x <= 20; x++) { ctx.beginPath(); ctx.moveTo(x * cw, 0); ctx.lineTo(x * cw, h); ctx.stroke(); }
  for (let y = 0; y <= 12; y++) { ctx.beginPath(); ctx.moveTo(0, y * ch); ctx.lineTo(w, y * ch); ctx.stroke(); }
  ctx.strokeStyle = '#ffffff60'; ctx.setLineDash([6, 8]); ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke(); ctx.setLineDash([]);
  if (!battle) { ctx.fillStyle = '#080d14b8'; ctx.fillRect(side ? 0 : w / 2, 0, w / 2, h); }
  if (!battle && hover) { ctx.fillStyle = '#ffffff20'; ctx.fillRect(hover.x * cw, hover.y * ch, cw, ch); ctx.strokeStyle = '#ffffff45'; ctx.beginPath(); ctx.ellipse((hover.x + .5) * cw, (hover.y + .5) * ch, selectedRange * cw, selectedRange * ch, 0, 0, Math.PI * 2); ctx.stroke(); }
  const units = battle ? battle.units.filter(u => u.hp > 0) : armies[side]!.map((p, i) => ({ ...p, x: p.x + .5, y: p.y + .5, side, hp: UNITS[p.type].hp, id: i }));
  for (const u of units) {
    const x = u.x * cw, y = u.y * ch, d = UNITS[u.type]; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `bold ${Math.min(cw, ch) * .73}px sans-serif`;
    ctx.shadowColor = u.side ? '#ff5a5a' : '#4aa8ff'; ctx.shadowBlur = 10; ctx.fillStyle = u.side ? '#ff7777' : '#6ebcff'; ctx.fillText(d.icon, x, y); ctx.shadowBlur = 0;
    if (battle) { ctx.fillStyle = '#08101c'; ctx.fillRect(x - cw * .35, y - ch * .48, cw * .7, 4); ctx.fillStyle = u.side ? '#ff7777' : '#6ebcff'; ctx.fillRect(x - cw * .35, y - ch * .48, cw * .7 * Math.max(0, u.hp / d.hp), 4); }
  }
  if (battle) for (const e of battle.effects) {
    ctx.globalAlpha = Math.max(0, 1 - e.age / .7); ctx.strokeStyle = e.kind === 'heal' ? '#87efb7' : e.side ? '#ff9a9a' : '#9ed4ff'; ctx.lineWidth = e.kind === 'siege' ? 3 : 1.5; ctx.beginPath(); ctx.moveTo(e.x * cw, e.y * ch); ctx.lineTo(e.x2 * cw, e.y2 * ch); ctx.stroke(); ctx.fillStyle = ctx.strokeStyle; ctx.font = 'bold 13px sans-serif'; if (e.value) ctx.fillText(`${e.kind === 'heal' ? '+' : '−'}${Math.round(e.value)}`, e.x2 * cw, e.y2 * ch - 15 - e.age * 20); if (e.kind === 'death') { for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.fillRect(e.x * cw + Math.cos(a) * e.age * 35, e.y * ch + Math.sin(a) * e.age * 35, 3, 3); } } ctx.globalAlpha = 1;
  }
  ctx.restore();
}
