import { UNITS } from './units';
import { sprite } from './sprites';
import { terrain } from './terrain';
import type { Battle, Effect, Placement, Side } from './sim';

const TAU = Math.PI * 2;

/** 공격 한 번을 그립니다: 근접은 베기 호, 원거리는 날아가는 화살, 시즈는 포물선 포탄과 폭발, 치료는 반짝이는 빛. */
function drawEffect(ctx: CanvasRenderingContext2D, e: Effect, cw: number, ch: number): void {
  const x1 = e.x * cw, y1 = e.y * ch, x2 = e.x2 * cw, y2 = e.y2 * ch, t = e.age, col = e.kind === 'heal' ? '#87efb7' : e.side ? '#ff9a9a' : '#9ed4ff';
  const far = Math.hypot(x2 - x1, y2 - y1) > cw * 1.5; ctx.save(); ctx.lineCap = 'round';
  if (e.kind === 'siege') {
    const f = Math.min(1, t / .28);
    if (f < 1) { const bx = x1 + (x2 - x1) * f, by = y1 + (y2 - y1) * f - Math.sin(f * Math.PI) * 70; ctx.fillStyle = '#10141a'; ctx.beginPath(); ctx.arc(bx, by, 6, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffd37a'; ctx.beginPath(); ctx.arc(bx - 1.5, by - 1.5, 2, 0, TAU); ctx.fill(); }
    else { const k = Math.min(1, (t - .28) / .45); ctx.globalAlpha = 1 - k; const g = ctx.createRadialGradient(x2, y2, 2, x2, y2, 14 + k * 46); g.addColorStop(0, '#fff6c8'); g.addColorStop(.45, '#ff9a3c'); g.addColorStop(1, '#ff5a2a00'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x2, y2, 14 + k * 46, 0, TAU); ctx.fill(); }
  } else if (e.kind === 'heal') {
    ctx.globalAlpha = Math.max(0, 1 - t / .8); ctx.strokeStyle = '#87efb766'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.fillStyle = col; for (let i = 0; i < 5; i++) { const a = i * 1.26 + t * 3, r = 10 + i * 2; ctx.fillRect(x2 + Math.cos(a) * r - 1.5, y2 - t * 30 - i * 3 + Math.sin(a) * 4, 3, 3); ctx.fillRect(x2 + Math.cos(a) * r - 1, y2 - t * 30 - i * 3 + Math.sin(a) * 4 - 3, 1, 9); }
  } else if (e.kind === 'hit') {
    if (far) {
      const f = Math.min(1, t / .16); const ax = x1 + (x2 - x1) * f, ay = y1 + (y2 - y1) * f, ang = Math.atan2(y2 - y1, x2 - x1);
      if (f < 1) { ctx.strokeStyle = '#f2eddc'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(ax - Math.cos(ang) * 16, ay - Math.sin(ang) * 16); ctx.lineTo(ax, ay); ctx.stroke(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ax, ay, 3, 0, TAU); ctx.fill(); }
    }
    const k = far ? Math.max(0, (t - .16) / .3) : Math.min(1, t / .3);
    if (k > 0 && k < 1) { ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#fffbe8'; ctx.lineWidth = 3.5 - k * 2.5; const ang = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2; ctx.beginPath(); ctx.arc(x2, y2, 16 + k * 8, ang - 1.1 + k * .5, ang + 1.1 + k * .5); ctx.stroke(); ctx.fillStyle = col; for (let i = 0; i < 4; i++) { const a = ang - 1.6 + i * 1.1; ctx.fillRect(x2 + Math.cos(a) * (10 + k * 24) - 1.5, y2 + Math.sin(a) * (10 + k * 24) - 1.5, 3, 3); } }
  } else {
    ctx.globalAlpha = Math.max(0, 1 - t / .7); const g = ctx.createRadialGradient(x1, y1, 2, x1, y1, 12 + t * 50); g.addColorStop(0, '#ffffffcc'); g.addColorStop(1, '#ffffff00'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x1, y1, 12 + t * 50, 0, TAU); ctx.fill();
    ctx.fillStyle = e.side ? '#ff7777' : '#6ebcff'; for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + .3, d = t * 46; ctx.beginPath(); ctx.arc(x1 + Math.cos(a) * d, y1 + Math.sin(a) * d - t * 8, 3.2 - t * 3, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
  if (e.value && e.kind !== 'death') { ctx.save(); ctx.globalAlpha = Math.max(0, 1 - t / .7); ctx.textAlign = 'center'; ctx.font = 'bold 14px sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = '#0b1018'; ctx.fillStyle = col; const label = `${e.kind === 'heal' ? '+' : '−'}${Math.round(e.value)}`, ty = y2 - 28 - t * 22; ctx.strokeText(label, x2, ty); ctx.fillText(label, x2, ty); ctx.restore(); }
}

export function draw(canvas: HTMLCanvasElement, armies: Placement[][], side: Side, battle: Battle | null, selectedRange: number, hover: { x: number; y: number } | null): void {
  const ctx = canvas.getContext('2d')!; const w = canvas.width, h = canvas.height, cw = w / 12, ch = h / 20;
  ctx.save();
  if (battle && battle.effects.some(e => e.kind === 'siege' && e.age > .28 && e.age < .4) && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) ctx.translate(Math.sin(battle.tick * 3) * 3, Math.cos(battle.tick * 4) * 2);
  ctx.drawImage(terrain(w, h), 0, 0);
  ctx.strokeStyle = '#ffffff0a'; ctx.lineWidth = 1;
  for (let x = 0; x <= 12; x++) { ctx.beginPath(); ctx.moveTo(x * cw, 0); ctx.lineTo(x * cw, h); ctx.stroke(); }
  for (let y = 0; y <= 20; y++) { ctx.beginPath(); ctx.moveTo(0, y * ch); ctx.lineTo(w, y * ch); ctx.stroke(); }
  if (!battle) { ctx.fillStyle = '#080d14c4'; ctx.fillRect(0, side ? h / 2 : 0, w, h / 2); }
  if (!battle && hover) { ctx.fillStyle = '#ffffff20'; ctx.fillRect(hover.x * cw, hover.y * ch, cw, ch); ctx.strokeStyle = '#ffffff45'; ctx.beginPath(); ctx.ellipse((hover.x + .5) * cw, (hover.y + .5) * ch, selectedRange * cw, selectedRange * ch, 0, 0, TAU); ctx.stroke(); }
  const units = battle ? battle.units.filter(u => u.hp > 0) : armies[side]!.map((p, i) => ({ ...p, x: p.x + .5, y: p.y + .5, side, hp: UNITS[p.type].hp, id: i }));
  for (const u of [...units].sort((a, b) => a.y - b.y)) {
    const x = u.x * cw, y = u.y * ch, d = UNITS[u.type], size = Math.min(cw, ch) * 1.5, bob = battle ? Math.sin(battle.tick * 9 + u.id * 1.7) * 1.6 : 0;
    ctx.strokeStyle = u.side ? '#ff6a70aa' : '#4fa8ffaa'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(x, y + size * .3, size * .34, size * .1, 0, 0, TAU); ctx.stroke();
    ctx.drawImage(sprite(u.type, u.side), x - size / 2, y - size * .56 + bob, size, size);
    if (battle) { ctx.fillStyle = '#08101c'; ctx.fillRect(x - cw * .35, y - size * .64, cw * .7, 4); ctx.fillStyle = u.side ? '#ff7777' : '#6ebcff'; ctx.fillRect(x - cw * .35, y - size * .64, cw * .7 * Math.max(0, u.hp / d.hp), 4); }
  }
  if (battle) for (const e of battle.effects) drawEffect(ctx, e, cw, ch);
  ctx.restore();
}
