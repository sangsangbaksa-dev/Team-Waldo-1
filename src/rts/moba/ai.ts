// FRONTLINE 롤식 라인전 — 봇 챔피언. 사람과 같은 명령(Cmd)만 내립니다: 라인을 밀고, 스킬을 쓰고, 위험하면 귀환하고, 돈이 모이면 삽니다.
import { TICK } from '../config';
import { CHAMPS, ITEMS, LEVELS, type ItemId, type Level } from './config';
import { lanePath, type Lane, type Pt } from './config';
import type { Ent, MobaSim } from './sim';

const BUILD: Record<string, ItemId[]> = {
  blade: ['ruby', 'boots', 'plate', 'heart', 'sword', 'heart'],
  arcana: ['crystal', 'boots', 'sword', 'bow', 'ruby', 'sword'],
  ranger: ['bow', 'boots', 'scythe', 'sword', 'ruby', 'plate'],
};
/** 결정적인 0~1 값(같은 입력이면 같은 값). */
const roll = (a: number, b: number): number => { let h = Math.imul(a * 73856093 ^ b * 19349663, 0x9e3779b1); h ^= h >>> 15; return ((h >>> 0) % 1000) / 1000; };

export class MobaAi {
  constructor(readonly team: number, readonly level: Level) {}
  get interval(): number { return LEVELS[this.level].react; }

  think(s: MobaSim): void { for (const e of s.heroes(this.team)) if (e.hero!.bot && !e.hero!.dead && (s.tick + e.id) % this.interval === 0) this.hero(s, e); }

  private hero(s: MobaSim, e: Ent): void {
    const h = e.hero!, L = LEVELS[this.level], foeTeam = 1 - e.team, lane = h.lane as Lane, path = lanePath(lane, e.team);
    // 구매
    const next = BUILD[h.champ]?.[h.items.length]; if (next && s.canBuy(e, next)) { s.apply(e.id, { k: 'buy', item: next }); }
    const foes = s.ents.filter(t => t.team === foeTeam && t.hp > 0 && !t.hero?.dead);
    const near = (r: number): Ent[] => foes.filter(t => s.dist(e, t) < r);
    const heroesNear = near(13).filter(t => t.hero), threat = near(10).filter(t => t.hero).length;
    const hpr = e.hp / e.maxhp;
    // 귀환·재정비
    const wantHome = hpr < 0.3 || (h.items.length < 6 && next !== undefined && h.gold >= ITEMS[next].cost && hpr < 0.75) || (h.mp < h.maxmp * 0.12 && hpr < 0.6);
    if (h.recall > 0) return;
    if (s.inBase(e)) { if (hpr > 0.92 && h.mp > h.maxmp * 0.7 && !(next && h.gold >= ITEMS[next].cost && h.items.length < 6)) this.goLane(s, e, path); return; }
    if (wantHome) {
      if (heroesNear.length === 0 && near(8).length === 0) { s.apply(e.id, { k: 'recall' }); return; }
      const back = this.backPoint(s, e, path); s.apply(e.id, { k: 'move', x: back.x, y: back.y }); if (hpr < 0.3) this.escape(s, e, heroesNear); return;
    }
    // 스킬
    const enemyHero = heroesNear.filter(t => !t.hero!.dead).sort((a, b) => s.dist(e, a) - s.dist(e, b))[0];
    if (enemyHero && roll(s.tick, e.id) < L.aim) this.skills(s, e, enemyHero, near(10));
    else if (!enemyHero) { const wave = near(7).filter(t => t.kind === 'melee' || t.kind === 'caster' || t.kind === 'siege' || t.kind === 'monster'); if (wave.length >= 3) for (let i = 0; i < 4; i++) { const k = s.skill(e, i); if (k.kind === 'aoe' && (k.radius ?? 0) >= 3 && k.range <= 10 && h.mp > h.maxmp * 0.6 && this.can(s, e, i)) { const t = wave[0]; s.apply(e.id, { k: 'cast', i, x: t.x, y: t.y }); break; } } }
    // 포탑 사거리: 아군 미니언이 충분히 덮어 줄 때만 들어갑니다.
    const tur = foes.find(t => t.kind === 'turret' && s.dist(e, t) < t.range + 1.2 && s.vulnerable(t));
    const cover = s.ents.filter(m => m.team === e.team && (m.kind === 'melee' || m.kind === 'caster' || m.kind === 'siege') && tur && s.dist(m, tur) < 8).length;
    if (tur && cover < 2) { const back = this.backPoint(s, e, path); s.apply(e.id, { k: 'move', x: back.x, y: back.y }); return; }
    if (threat >= 2 && hpr < 0.6) { this.escape(s, e, heroesNear); return; }
    this.goLane(s, e, path);
  }
  private can(s: MobaSim, e: Ent, i: number): boolean { const h = e.hero!, k = s.skill(e, i); return h.level >= k.level && s.tick >= h.ready[i] && h.mp >= k.mana; }
  private skills(s: MobaSim, e: Ent, t: Ent, around: Ent[]): void {
    const h = e.hero!, d = s.dist(e, t), hpr = e.hp / e.maxhp;
    for (let i = 3; i >= 0; i--) {
      if (!this.can(s, e, i)) continue; const k = s.skill(e, i);
      if (k.kind === 'dash') {
        if (k.dmg) { if (d <= k.range + 1 && d > 2 && hpr > 0.4 && (i !== 3 || t.hp < t.maxhp * 0.6 || around.length >= 2)) { s.apply(e.id, { k: 'cast', i, x: t.x, y: t.y }); return; } }
        else if (hpr < 0.35 && d < 6) { const dx = e.x - t.x, dy = e.y - t.y; s.apply(e.id, { k: 'cast', i, x: e.x + dx, y: e.y + dy }); return; }
      } else if (k.kind === 'buff') { if (d < 9) { s.apply(e.id, { k: 'cast', i, x: t.x, y: t.y }); return; } }
      else if (k.kind === 'aoe') { if (k.range === 0 ? d < (k.radius ?? 3) : d <= k.range + 1) { if (i === 3 && t.hp > t.maxhp * 0.7 && around.length < 2) continue; s.apply(e.id, { k: 'cast', i, x: t.x, y: t.y }); return; } }
      else if (k.kind === 'shot') { if (d <= k.range) { if (i === 3 && t.hp > t.maxhp * 0.65) continue; s.apply(e.id, { k: 'cast', i, x: t.x, y: t.y }); return; } }
    }
    void h;
  }
  private escape(s: MobaSim, e: Ent, foes: Ent[]): void {
    for (let i = 0; i < 4; i++) { const k = s.skill(e, i); if (k.kind === 'dash' && !k.dmg && this.can(s, e, i) && foes[0]) { s.apply(e.id, { k: 'cast', i, x: e.x + (e.x - foes[0].x), y: e.y + (e.y - foes[0].y) }); return; } if (k.kind === 'buff' && k.speed && this.can(s, e, i)) { s.apply(e.id, { k: 'cast', i, x: e.x, y: e.y }); return; } }
  }
  /** 우리 쪽으로 물러날 자리: 길목에서 안쪽으로 조금. */
  private backPoint(s: MobaSim, e: Ent, path: Pt[]): Pt {
    let bi = 0, bd = Infinity; path.forEach((p, i) => { const d = s.dist(e, p); if (d < bd) { bd = d; bi = i; } });
    const p = path[Math.max(0, bi - 1)], n = NEXUSOF(s, e); return { x: p.x * 0.6 + n.x * 0.4, y: p.y * 0.6 + n.y * 0.4 };
  }
  private goLane(s: MobaSim, e: Ent, path: Pt[]): void {
    const lane = e.hero!.lane; let front: Ent | null = null, fp = -1;
    for (const m of s.ents) if (m.team === e.team && m.lane === lane && (m.kind === 'melee' || m.kind === 'caster' || m.kind === 'siege') && s.tick >= m.spawnAt) { const p = m.wp + 1 - s.dist(m, path[Math.min(m.wp, path.length - 1)]) / 40; if (p > fp) { fp = p; front = m; } }
    let goal: Pt;
    if (front) { const back = { x: front.x - front.fx * 1.8, y: front.y - front.fy * 1.8 }; goal = back; }
    else { const first = s.ents.find(t => t.team === e.team && t.kind === 'turret' && t.lane === lane && t.hp > 0); goal = first ? { x: first.x, y: first.y } : path[1]; }
    const o = e.hero!.o; if (o.t === 'amove' && Math.hypot(o.x - goal.x, o.y - goal.y) < 2.5) return;
    s.apply(e.id, { k: 'amove', x: goal.x, y: goal.y });
  }
}
const NEXUSOF = (s: MobaSim, e: Ent): Pt => s.fountain(e.team);
void TICK; void CHAMPS;
