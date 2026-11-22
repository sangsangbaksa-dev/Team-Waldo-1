import { UNITS, type UnitType } from './units';
import { sprite } from './sprites';
import { terrain } from './terrain';
import type { Battle, Effect, Placement, Side } from './sim';

const TAU = Math.PI * 2;
const reduceMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

/** 둥근 체력 막대: 어두운 틀 + 위아래 그라데이션 + 윗면 광택. 체력이 낮으면 주황·빨강으로 바뀝니다. */
function hpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, f: number, side: Side): void {
  const h = 6, col = f < .3 ? ['#ffb36b', '#d9481f'] : side ? ['#ffa3a3', '#d6454f'] : ['#a9dcff', '#2f7fd6'];
  ctx.fillStyle = '#060a12e6'; ctx.beginPath(); ctx.roundRect(x - 1.5, y - 1.5, w + 3, h + 3, 4); ctx.fill();
  if (f > 0) { const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, col[0]!); g.addColorStop(1, col[1]!); ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, y, Math.max(h, w * f), h, 3); ctx.fill(); ctx.fillStyle = '#ffffff55'; ctx.fillRect(x + 2, y + 1, Math.max(0, w * f - 4), 1.5); }
}

/** 네 갈래 반짝임(사각 점 대신). */
function spark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill();
}

/** 치료 십자 문양(테두리 있는 둥근 십자). */
function plus(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath(); ctx.roundRect(x - s * .3, y - s, s * .6, s * 2, s * .25); ctx.roundRect(x - s, y - s * .3, s * 2, s * .6, s * .25); ctx.fill();
}

/** 공격 한 번을 그립니다: 근접은 베기 호, 원거리는 날아가는 화살, 시즈는 포물선 포탄과 폭발, 치료는 반짝이는 빛. */
function drawEffect(ctx: CanvasRenderingContext2D, e: Effect, cw: number, ch: number): void {
  const x1 = e.x * cw, y1 = e.y * ch, x2 = e.x2 * cw, y2 = e.y2 * ch, t = e.age, col = e.kind === 'heal' ? '#87efb7' : e.side ? '#ff9a9a' : '#9ed4ff';
  const far = Math.hypot(x2 - x1, y2 - y1) > cw * 1.5; ctx.save(); ctx.lineCap = 'round';
  if (e.kind === 'siege') {
    const f = Math.min(1, t / .28);
    if (f < 1) { const bx = x1 + (x2 - x1) * f, by = y1 + (y2 - y1) * f - Math.sin(f * Math.PI) * 70; ctx.fillStyle = '#10141a'; ctx.beginPath(); ctx.arc(bx, by, 6, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffd37a'; ctx.beginPath(); ctx.arc(bx - 1.5, by - 1.5, 2, 0, TAU); ctx.fill(); }
    else { const k = Math.min(1, (t - .28) / .45); ctx.globalAlpha = 1 - k; const g = ctx.createRadialGradient(x2, y2, 2, x2, y2, 14 + k * 46); g.addColorStop(0, '#fff6c8'); g.addColorStop(.45, '#ff9a3c'); g.addColorStop(1, '#ff5a2a00'); ctx.fillStyle = g; ctx.globalCompositeOperation = 'lighter'; ctx.beginPath(); ctx.arc(x2, y2, 14 + k * 46, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; // 불빛은 덧셈 합성으로 바닥을 밝힘
      ctx.strokeStyle = '#fff1c2'; ctx.lineWidth = 3 * (1 - k); ctx.beginPath(); ctx.ellipse(x2, y2 + 6, 20 + k * 52, 7 + k * 16, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#3a2a1e'; for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + .4, d = 10 + k * 40; spark(ctx, x2 + Math.cos(a) * d, y2 + Math.sin(a) * d * .6 - Math.sin(k * Math.PI) * 18, 4 * (1 - k) + 1); } }
  } else if (e.kind === 'heal') {
    ctx.globalAlpha = Math.max(0, 1 - t / .8); ctx.strokeStyle = '#87efb766'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const hg = ctx.createRadialGradient(x2, y2, 1, x2, y2, 22); hg.addColorStop(0, '#87efb766'); hg.addColorStop(1, '#87efb700'); ctx.fillStyle = hg; ctx.globalCompositeOperation = 'lighter'; ctx.beginPath(); ctx.arc(x2, y2, 22, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = col; for (let i = 0; i < 5; i++) { const a = i * 1.26 + t * 3, r = 10 + i * 2, px = x2 + Math.cos(a) * r, py = y2 - t * 30 - i * 3 + Math.sin(a) * 4; if (i % 2) spark(ctx, px, py, 3.5); else plus(ctx, px, py, 3.5); }
  } else if (e.kind === 'hit') {
    if (far) {
      const f = Math.min(1, t / .16); const ax = x1 + (x2 - x1) * f, ay = y1 + (y2 - y1) * f, ang = Math.atan2(y2 - y1, x2 - x1);
      if (f < 1) { ctx.strokeStyle = '#f2eddc'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(ax - Math.cos(ang) * 16, ay - Math.sin(ang) * 16); ctx.lineTo(ax, ay); ctx.stroke(); ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang); ctx.fillStyle = '#d7dde6'; ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(-3, -3.5); ctx.lineTo(-3, 3.5); ctx.closePath(); ctx.fill(); ctx.fillStyle = col; ctx.fillRect(-18, -2.5, 5, 5); ctx.restore(); }
    }
    const k = far ? Math.max(0, (t - .16) / .3) : Math.min(1, t / .3);
    if (k > 0 && k < 1) { ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#fffbe8'; ctx.lineWidth = 3.5 - k * 2.5; const ang = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2; ctx.beginPath(); ctx.arc(x2, y2, 16 + k * 8, ang - 1.1 + k * .5, ang + 1.1 + k * .5); ctx.stroke(); ctx.fillStyle = col; for (let i = 0; i < 4; i++) { const a = ang - 1.6 + i * 1.1; spark(ctx, x2 + Math.cos(a) * (10 + k * 24), y2 + Math.sin(a) * (10 + k * 24), 4.5 - k * 2.5); } }
  } else {
    ctx.globalAlpha = Math.max(0, .6 - t / 1.2); for (let i = 0; i < 4; i++) { const sx = x1 + Math.cos(i * 1.9) * (6 + t * 18), sy = y1 - t * 26 - i * 4, sr = 8 + t * 22 + i * 2, sg = ctx.createRadialGradient(sx, sy, 1, sx, sy, sr); sg.addColorStop(0, '#5a6270aa'); sg.addColorStop(1, '#5a627000'); ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = Math.max(0, 1 - t / .7); const g = ctx.createRadialGradient(x1, y1, 2, x1, y1, 12 + t * 50); g.addColorStop(0, '#ffffffcc'); g.addColorStop(1, '#ffffff00'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x1, y1, 12 + t * 50, 0, TAU); ctx.fill();
    ctx.fillStyle = e.side ? '#ff7777' : '#6ebcff'; for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + .3, d = t * 46; ctx.beginPath(); ctx.arc(x1 + Math.cos(a) * d, y1 + Math.sin(a) * d - t * 8, 3.2 - t * 3, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
  if (e.value && e.kind !== 'death') { ctx.save(); ctx.globalAlpha = Math.max(0, 1 - t / .7); ctx.textAlign = 'center'; ctx.font = 'bold 14px sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = '#0b1018'; ctx.fillStyle = col; const label = `${e.kind === 'heal' ? '+' : '−'}${Math.round(e.value)}`, ty = y2 - 28 - t * 22; ctx.strokeText(label, x2, ty); ctx.fillText(label, x2, ty); ctx.restore(); }
}

export function draw(canvas: HTMLCanvasElement, armies: Placement[][], side: Side, battle: Battle | null, selectedRange: number, hover: { x: number; y: number } | null, ghost?: UnitType): void {
  const ctx = canvas.getContext('2d')!; const w = canvas.width, h = canvas.height, cw = w / 12, ch = h / 20;
  ctx.save();
  if (battle && battle.effects.some(e => e.kind === 'siege' && e.age > .28 && e.age < .4) && !reduceMotion?.matches) ctx.translate(Math.sin(battle.tick * 3) * 3, Math.cos(battle.tick * 4) * 2);
  ctx.drawImage(terrain(w, h), 0, 0);
  if (!battle) {
    // 상대 진영 가림막: 어두운 그라데이션 + 전선 쪽 점선 경계.
    const oy = side ? h / 2 : 0, vg = ctx.createLinearGradient(0, oy, 0, oy + h / 2); vg.addColorStop(side ? 0 : 1, '#080d14a0'); vg.addColorStop(side ? 1 : 0, '#080d14e6');
    ctx.fillStyle = vg; ctx.fillRect(0, oy, w, h / 2);
    // 내 진영: 팀 색 안쪽 테두리 빛.
    const my = side ? 0 : h / 2, rim = ctx.createLinearGradient(0, my, 0, my + h / 2); rim.addColorStop(side ? 1 : 0, side ? '#ff6a7040' : '#4fa8ff40'); rim.addColorStop(side ? .75 : .25, '#0000'); ctx.fillStyle = rim; ctx.fillRect(0, my, w, h / 2);
    ctx.save(); ctx.setLineDash([10, 8]); ctx.lineWidth = 2; ctx.strokeStyle = side ? '#ff8a8fb0' : '#7cc0ffb0'; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke(); ctx.restore();
  }
  if (!battle && hover) {
    const hx = (hover.x + .5) * cw, hy = (hover.y + .5) * ch, tint = side ? '#ff7a80' : '#6ebcff';
    const rg = ctx.createRadialGradient(hx, hy, 0, hx, hy, selectedRange * cw); rg.addColorStop(0, tint + '30'); rg.addColorStop(1, tint + '06');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.ellipse(hx, hy, selectedRange * cw, selectedRange * ch, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.setLineDash([6, 6]); ctx.strokeStyle = tint + 'b0'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
    const cg = ctx.createLinearGradient(0, hover.y * ch, 0, (hover.y + 1) * ch); cg.addColorStop(0, tint + '55'); cg.addColorStop(1, tint + '18');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.roundRect(hover.x * cw + 1, hover.y * ch + 1, cw - 2, ch - 2, 6); ctx.fill(); ctx.strokeStyle = tint + 'd0'; ctx.lineWidth = 2; ctx.stroke();
    // 놓기 전 미리보기: 반투명 병사 + 발밑 그림자(내 진영 칸에서만).
    if (ghost && hover.y >= (side ? 0 : 10) && hover.y < (side ? 10 : 20) && hover.x >= 0 && hover.x < 12) { const gs = Math.min(cw, ch) * 1.5; ctx.save(); ctx.globalAlpha = .62; ctx.drawImage(sprite(ghost, side), hx - gs / 2, hy - gs * .56, gs, gs); ctx.restore(); }
  }
  // 쓰러진 병사 자리: 그을린 얼룩과 팀 색 천 조각이 전투가 끝날 때까지 남습니다.
  if (battle) for (const u of battle.units) if (u.hp <= 0) {
    const x = u.x * cw, y = u.y * ch + Math.min(cw, ch) * .42, rs = Math.min(cw, ch) * .5, sg = ctx.createRadialGradient(x, y, 1, x, y, rs);
    sg.addColorStop(0, '#05070bcc'); sg.addColorStop(.6, '#05070b66'); sg.addColorStop(1, '#0000');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(x, y, rs, rs * .38, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = u.side ? '#a82b3acc' : '#1b5aa6cc'; ctx.beginPath(); ctx.moveTo(x - 7, y - 1); ctx.quadraticCurveTo(x, y - 6, x + 8, y - 2); ctx.lineTo(x + 5, y + 3); ctx.quadraticCurveTo(x - 1, y + 1, x - 6, y + 4); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#0b1018aa'; ctx.lineWidth = 1; ctx.stroke();
  }
  const units = battle ? battle.units.filter(u => u.hp > 0) : armies[side]!.map((p, i) => ({ ...p, x: p.x + .5, y: p.y + .5, side, hp: UNITS[p.type].hp, id: i }));
  for (const u of units.sort((a, b) => a.y - b.y)) {
    const x = u.x * cw, y = u.y * ch, d = UNITS[u.type], size = Math.min(cw, ch) * 1.5, bob = battle ? Math.sin(battle.tick * 9 + u.id * 1.7) * 1.6 : 0;
    // 발밑 진영 광원: 바닥에 번지는 빛 + 밝은 테두리.
    const gy = y + size * .3, glow = ctx.createRadialGradient(x, gy, 1, x, gy, size * .42);
    glow.addColorStop(0, u.side ? '#ff6a7055' : '#4fa8ff55'); glow.addColorStop(1, '#0000');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.ellipse(x, gy, size * .42, size * .14, 0, 0, TAU); ctx.fill();
    const cs = ctx.createRadialGradient(x + size * .05, gy, 1, x + size * .05, gy, size * .3); cs.addColorStop(0, '#000000a0'); cs.addColorStop(1, '#0000'); ctx.fillStyle = cs; ctx.beginPath(); ctx.ellipse(x + size * .05, gy, size * .3, size * .09, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = u.side ? '#ff8a8fcc' : '#7cc0ffcc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, gy, size * .34, size * .1, 0, 0, TAU); ctx.stroke();
    ctx.drawImage(sprite(u.type, u.side), x - size / 2, y - size * .56 + bob, size, size);
    if (battle) hpBar(ctx, x - cw * .36, y - size * .66, cw * .72, Math.max(0, u.hp / d.hp), u.side);
  }
  if (battle) for (const e of battle.effects) drawEffect(ctx, e, cw, ch);
  ctx.restore();
}
