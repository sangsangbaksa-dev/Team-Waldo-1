// FRONTLINE 롤식 라인전 — 봇 챔피언. 사람과 같은 명령(Cmd)만 내립니다: 라인을 밀고, 스킬을 쓰고, 위험하면 귀환하고, 돈이 모이면 삽니다.
import { TICK } from '../config';
import { CHAMPS, ITEMS, LEVELS, NEXUS, type ItemId, type Level, type SpellId } from './config';
import { lanePath, type Lane, type Pt } from './config';
import { isMinion, type Ent, type MobaSim } from './sim';

const BUILD: Record<string, ItemId[]> = {
  blade: ['ruby', 'boots', 'plate', 'heart', 'sword', 'heart'],
  shade: ['sword', 'boots', 'scythe', 'cloak', 'sword', 'plate'],
  priest: ['crystal', 'boots', 'wand', 'ruby', 'plate', 'aegis'],
  arcana: ['crystal', 'boots', 'sword', 'bow', 'ruby', 'sword'],
  ranger: ['bow', 'boots', 'scythe', 'mask', 'ruby', 'plate'],
  titan: ['ruby', 'tabi', 'thorn', 'heart', 'aegis', 'plate'],
  ember: ['crystal', 'boots', 'tome', 'wand', 'ring', 'ruby'],
  lancer: ['sword', 'boots', 'crown', 'scythe', 'mask', 'plate'],
  seer: ['crystal', 'boots', 'tome', 'ring', 'ruby', 'aegis'],
};
/** 결정적인 0~1 값(같은 입력이면 같은 값). */
const roll = (a: number, b: number): number => { let h = Math.imul(a * 73856093 ^ b * 19349663, 0x9e3779b1); h ^= h >>> 15; return ((h >>> 0) % 1000) / 1000; };

export class MobaAi {
  constructor(readonly team: number, readonly level: Level) {}
  get interval(): number { return LEVELS[this.level].react; }

  /** 드래곤·바론을 치러 가는 원정대(최대 2명). 쉬움 난이도는 하지 않습니다. */
  private squad: { target: number; ids: number[]; until: number } | null = null;
  private nextPlan = 0;

  think(s: MobaSim): void {
    if (this.level !== 'easy') this.plan(s);
    for (const e of s.heroes(this.team)) if (e.hero!.bot && !e.hero!.dead && (s.tick + e.id) % this.interval === 0) this.hero(s, e);
  }

  private plan(s: MobaSim): void {
    const sq = this.squad, target = sq ? s.index.get(sq.target) : undefined;
    if (sq && (!target || target.hp <= 0 || s.tick > sq.until)) { this.squad = null; this.nextPlan = s.tick + 20 * TICK; return; }
    if (sq) { // 적이 둘 이상 나타나거나 체력이 바닥나면 포기
      const foes = s.ents.filter(t => t.team !== this.team && t.hero && t.hp > 0 && !t.hero.dead && target && s.dist(t, target) < 12);
      if (foes.length >= 2 || sq.ids.some(id => { const m = s.index.get(id); return !m || m.hero!.dead || m.hp < m.maxhp * 0.4; })) { this.squad = null; this.nextPlan = s.tick + 25 * TICK; }
      return;
    }
    if (s.tick < Math.max(this.nextPlan, 4 * 60 * TICK) || s.tick % 20 !== 0) return;
    const able = s.heroes(this.team).filter(e => e.hero!.bot && !e.hero!.dead && e.hero!.level >= 5 && e.hp > e.maxhp * 0.65 && !s.inBase(e) && e.hero!.recall <= 0);
    if (able.length < 2) return;
    const pick = s.ents.filter(m => m.kind === 'monster' && m.hp > 0 && (m.sub === 'drake' || (m.sub === 'baron' && able.every(a => a.hero!.level >= 9)))).sort((a, b) => (a.sub === 'baron' ? 0 : 1) - (b.sub === 'baron' ? 0 : 1))[0];
    if (!pick) return;
    const squad = able.sort((a, b) => s.dist(a, pick) - s.dist(b, pick)).slice(0, 2).map(e => e.id);
    this.squad = { target: pick.id, ids: squad, until: s.tick + 40 * TICK };
  }

  private hero(s: MobaSim, e: Ent): void {
    const h = e.hero!, L = LEVELS[this.level], foeTeam = 1 - e.team, jungler = h.lane === 'jungle', lane = (jungler ? 'mid' : h.lane) as Lane, path = lanePath(lane, e.team);
    // 구매
    const next = BUILD[h.champ]?.[h.items.length]; if (next && s.canBuy(e, next)) { s.apply(e.id, { k: 'buy', item: next }); }
    const foes = s.ents.filter(t => t.team === foeTeam && t.hp > 0 && !t.hero?.dead && s.canSee(e.team, t));
    const near = (r: number): Ent[] => foes.filter(t => s.dist(e, t) < r);
    const heroesNear = near(13).filter(t => t.hero), threat = near(10).filter(t => t.hero).length;
    const hpr = e.hp / e.maxhp;
    // 귀환·재정비
    const wantHome = hpr < (jungler ? 0.4 : 0.3) || (h.items.length < 6 && next !== undefined && h.gold >= ITEMS[next].cost && hpr < 0.75) || (h.mp < h.maxmp * 0.12 && hpr < 0.6);
    if (h.recall > 0) return;
    if (s.inBase(e)) { if (hpr > 0.92 && h.mp > h.maxmp * 0.7 && !(next && h.gold >= ITEMS[next].cost && h.items.length < 6)) this.goLane(s, e, path); return; }
    if (wantHome) {
      if (heroesNear.length === 0 && near(8).length === 0) { s.apply(e.id, { k: 'recall' }); return; }
      const back = this.backPoint(s, e, path); s.apply(e.id, { k: 'move', x: back.x, y: back.y }); if (hpr < 0.3) this.escape(s, e, heroesNear); return;
    }
    this.spells(s, e, heroesNear.filter(t => !t.hero!.dead), hpr, threat);
    if (this.level !== 'easy') { this.ward(s, e); this.sweep(s, e); }
    // 오브젝트 원정: 몬스터를 직접 공격
    const sq = this.squad;
    if (sq && sq.ids.includes(e.id) && threat === 0) { const mon = s.index.get(sq.target); if (mon && mon.hp > 0) { if (s.dist(e, mon) > e.range + 0.5 || h.o.t !== 'attack') s.apply(e.id, { k: 'attack', target: mon.id }); return; } }
    // 스킬
    const enemyHero = heroesNear.filter(t => !t.hero!.dead).sort((a, b) => s.dist(e, a) - s.dist(e, b))[0];
    if (enemyHero && roll(s.tick, e.id) < L.aim) this.skills(s, e, enemyHero, near(10));
    else if (!enemyHero) { const wave = near(7).filter(t => isMinion(t.kind) || t.kind === 'monster'); if (wave.length >= 3) for (let i = 0; i < 4; i++) { const k = s.skill(e, i); if (k.kind === 'aoe' && (k.radius ?? 0) >= 3 && k.range <= 10 && h.mp > h.maxmp * 0.6 && this.can(s, e, i)) { const t = wave[0]; s.apply(e.id, { k: 'cast', i, x: t.x, y: t.y }); break; } } }
    if (jungler && this.jungle(s, e, foes, threat, hpr)) return;
    if (this.level !== 'easy' && this.helpAllies(s, e, threat, hpr, path)) return;
    // 마무리: 적 넥서스가 열려 있으면 곧장 파괴하러 갑니다(포탑이 남아 있어도 열린 길로).
    const nx = foes.find(t => t.kind === 'nexus' && s.vulnerable(t));
    if (nx && hpr > 0.45 && threat < 3) { if (s.dist(e, nx) > e.range + nx.range * 0 + 1.5) s.apply(e.id, { k: 'amove', x: nx.x, y: nx.y }); else if (h.o.t !== 'attack') s.apply(e.id, { k: 'attack', target: nx.id }); return; }
    // 포탑 사거리: 아군 미니언이 충분히 덮어 줄 때만 들어갑니다.
    const tur = foes.find(t => t.kind === 'turret' && s.dist(e, t) < t.range + 1.2 && s.vulnerable(t));
    const cover = s.ents.filter(m => m.team === e.team && isMinion(m.kind) && tur && s.dist(m, tur) < 8).length;
    if (tur && cover < 2) { const back = this.backPoint(s, e, path); s.apply(e.id, { k: 'move', x: back.x, y: back.y }); return; }
    if (threat >= 2 && hpr < 0.6) { this.escape(s, e, heroesNear); return; }
    this.goLane(s, e, path);
  }
  /** 소환사 주문: 위험하면 회복·방어막·점멸, 약한 적이 보이면 점화. */
  private spells(s: MobaSim, e: Ent, foes: Ent[], hpr: number, threat: number): void {
    const h = e.hero!, idx = (id: SpellId): number => h.spells.findIndex((sp, i) => sp === id && s.tick >= h.spellReady[i]);
    const foe = foes.sort((a, b) => s.dist(e, a) - s.dist(e, b))[0];
    let i = idx('heal'); if (i >= 0 && hpr < 0.38 && threat > 0) { s.apply(e.id, { k: 'spell', i, x: e.x, y: e.y }); return; }
    i = idx('barrier'); if (i >= 0 && hpr < 0.45 && threat > 0 && foe && s.dist(e, foe) < 7) { s.apply(e.id, { k: 'spell', i, x: e.x, y: e.y }); return; }
    i = idx('flash'); if (i >= 0 && hpr < 0.28 && foe && s.dist(e, foe) < 6) { const n = NEXUS[e.team]; s.apply(e.id, { k: 'spell', i, x: n.x, y: n.y }); return; }
    i = idx('ghost'); if (i >= 0 && ((hpr < 0.3 && foe) || (foe && foe.hero && foe.hp < foe.maxhp * 0.3 && s.dist(e, foe) < 14))) { s.apply(e.id, { k: 'spell', i, x: e.x, y: e.y }); return; }
    i = idx('ignite'); if (i >= 0 && foe && s.dist(e, foe) < 6.5 && (foe.hp < foe.maxhp * 0.28 || (this.level === 'hard' && foe.hp < foe.maxhp * 0.45 && hpr > 0.5))) { s.apply(e.id, { k: 'spell', i, x: foe.x, y: foe.y }); }
  }
  /** 가까이 보이는 적 와드가 있으면 부숩니다(싸우는 중에는 건너뜁니다). */
  private sweep(s: MobaSim, e: Ent): void {
    if (s.tick % 6 !== e.id % 6 || e.hero!.o.t === 'attack') return;
    const w = s.wards.find(o => o.team !== e.team && s.dist(e, o) < 4 && s.seenPt(e.team, o.x, o.y)); if (w) s.apply(e.id, { k: 'unward', id: w.id });
  }
  /** 와드: 앞쪽 시야가 비어 있으면 적진 쪽으로 8칸 앞에 놓습니다. */
  private ward(s: MobaSim, e: Ent): void {
    const h = e.hero!; if (h.wards < 1 || s.tick < 90 * TICK || s.tick % 10 !== e.id % 10) return;
    const n = NEXUS[1 - e.team], dx = n.x - e.x, dy = n.y - e.y, d = Math.hypot(dx, dy) || 1, x = e.x + dx / d * 8, y = e.y + dy / d * 8;
    if (s.wards.some(w => w.team === e.team && Math.hypot(w.x - x, w.y - y) < 10) || s.inBase(e)) return;
    s.apply(e.id, { k: 'ward', x, y });
  }
  /** 사람 동료의 핑에 반응하고, 아군 기지·안쪽 포탑이 공격받으면 수비하러 갑니다. */
  private helpAllies(s: MobaSim, e: Ent, threat: number, hpr: number, path: Pt[]): boolean {
    const h = e.hero!, ping = s.pings.find(p => p.team === e.team && p.by !== e.id && s.tick - p.at < 7 * TICK && s.dist(e, p) < 38);
    if (ping && ping.kind === 'assist' && hpr > 0.55 && h.o.t !== 'attack') { s.apply(e.id, { k: 'amove', x: ping.x, y: ping.y }); return true; }
    if (ping && ping.kind === 'retreat' && hpr < 0.8) { const b = this.backPoint(s, e, path); s.apply(e.id, { k: 'move', x: b.x, y: b.y }); return true; }
    if (hpr < 0.5 || threat >= 3) return false;
    for (const t of s.ents) {
      if (t.team !== e.team || t.hp <= 0 || !(t.kind === 'nexus' || t.kind === 'inhib' || (t.kind === 'turret' && t.tier >= 1))) continue;
      const foes = s.ents.filter(f => f.team === 1 - e.team && f.hp > 0 && !f.hero?.dead && (f.hero || isMinion(f.kind)) && s.dist(f, t) < 9);
      if (foes.length >= 2 && s.dist(e, t) < 46 && s.dist(e, t) > 6) { const f = foes[0]; s.apply(e.id, { k: 'amove', x: f.x, y: f.y }); return true; }
    }
    return false;
  }
  /** 정글러: 약해진 적 라이너를 노려 덮치고, 평소에는 우리 쪽 정글 몬스터를 사냥합니다. */
  private jungle(s: MobaSim, e: Ent, foes: Ent[], threat: number, hpr: number): boolean {
    const h = e.hero!;
    if (this.level !== 'easy' && h.level >= 3 && hpr > 0.6) {
      const prey = foes.filter(t => t.hero && t.hp < t.maxhp * 0.6 && s.dist(e, t) < 32 && foes.filter(o => o.hero && s.dist(o, t) < 12).length <= 2).sort((a, b) => a.hp / a.maxhp - b.hp / b.maxhp)[0];
      if (prey) { if (s.dist(e, prey) > e.range + 1) s.apply(e.id, { k: 'amove', x: prey.x, y: prey.y }); else if (h.o.t !== 'attack') s.apply(e.id, { k: 'attack', target: prey.id }); return true; }
    }
    if (threat >= 2) return false;
    const mine = (m: Ent): boolean => s.dist(m, NEXUS[e.team]) < s.dist(m, NEXUS[1 - e.team]);
    const mon = s.ents.filter(m => m.kind === 'monster' && m.hp > 0 && (m.sub === 'wolf' || m.sub === 'golem' || m.sub === 'raptor' || m.sub === 'krug' || (m.sub === 'crab' && h.level >= 3)) && (mine(m) || h.level >= 8 || m.sub === 'crab')).sort((a, b) => (a.sub === 'golem' ? 0 : 1) - (b.sub === 'golem' ? 0 : 1) || s.dist(e, a) - s.dist(e, b))[0];
    if (!mon) return false;
    if (s.dist(e, mon) > 9) { if (h.o.t !== 'move' || Math.hypot(h.o.x - mon.x, h.o.y - mon.y) > 3) s.apply(e.id, { k: 'move', x: mon.x, y: mon.y }); return true; }
    if (h.mp > h.maxmp * 0.45 && s.dist(e, mon) < 8) for (let i = 0; i < 4; i++) { const k = s.skill(e, i); if ((k.kind === 'aoe' || k.kind === 'shot') && this.can(s, e, i) && (k.radius ?? 0) <= 4.5 && k.range > 0) { s.apply(e.id, { k: 'cast', i, x: mon.x, y: mon.y }); break; } }
    if (h.o.t !== 'attack' || h.o.target !== mon.id) s.apply(e.id, { k: 'attack', target: mon.id });
    return true;
  }
  private can(s: MobaSim, e: Ent, i: number): boolean { const h = e.hero!, k = s.skill(e, i); return h.rank[i] >= 1 && s.tick >= h.ready[i] && h.mp >= k.mana; }
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
    for (const m of s.ents) if (m.team === e.team && m.lane === lane && isMinion(m.kind) && s.tick >= m.spawnAt) { const p = m.wp + 1 - s.dist(m, path[Math.min(m.wp, path.length - 1)]) / 40; if (p > fp) { fp = p; front = m; } }
    let goal: Pt;
    if (front) { const back = { x: front.x - front.fx * 1.8, y: front.y - front.fy * 1.8 }; goal = back; }
    else { const first = s.ents.find(t => t.team === e.team && t.kind === 'turret' && t.lane === lane && t.hp > 0); goal = first ? { x: first.x, y: first.y } : path[1]; }
    const o = e.hero!.o; if (o.t === 'amove' && Math.hypot(o.x - goal.x, o.y - goal.y) < 2.5) return;
    s.apply(e.id, { k: 'amove', x: goal.x, y: goal.y });
  }
}
const NEXUSOF = (s: MobaSim, e: Ent): Pt => s.fountain(e.team);
void TICK; void CHAMPS;
