import type { Stat } from '../../data/schema';
import { nextInt } from '../rng';
import type { PlayerState, PlayerStats, UpgradeChoice, World } from '../types';
import type { GameData } from '../../data/schema';

export function xpForLevel(data: GameData, level: number): number {
  const { base, growth } = data.balance.xpCurve;
  return Math.floor(base * Math.pow(growth, level - 1));
}

/** 기본 스탯에 패시브를 반영한다. 패시브가 바뀔 때만 호출한다. */
export function recomputeStats(player: PlayerState, data: GameData): void {
  const b = data.balance.player;
  const s: PlayerStats = {
    moveSpeed: b.moveSpeed,
    maxHp: b.hp,
    damage: 1,
    cooldown: 1,
    area: 1,
    pickupRange: b.pickupRange,
    xpGain: 1,
    armor: 0,
  };
  for (const ps of player.passives) {
    const def = data.passives[ps.def];
    const stat: Stat = def.stat;
    const v = def.perLevel * ps.level;
    s[stat] = def.op === 'mul' ? s[stat] * (1 + v) : s[stat] + v;
  }
  s.cooldown = Math.max(0.1, s.cooldown);
  // 최대 체력이 늘면 늘어난 만큼 현재 체력도 올려 준다
  const gained = s.maxHp - player.stats.maxHp;
  player.stats = s;
  if (gained > 0) player.hp += gained;
  player.hp = Math.min(player.hp, s.maxHp);
}

function generateChoices(world: World): UpgradeChoice[] {
  const { data, player, rng } = world;
  const bal = data.balance;
  const candidates: UpgradeChoice[] = [];

  data.weapons.forEach((def, i) => {
    const owned = player.weapons.find((w) => w.def === i);
    if (owned) {
      if (owned.level < def.levels.length) {
        candidates.push({ kind: 'weapon', id: def.id, name: def.name, level: owned.level + 1, isNew: false });
      }
    } else if (player.weapons.length < bal.maxWeapons) {
      candidates.push({ kind: 'weapon', id: def.id, name: def.name, level: 1, isNew: true });
    }
  });
  data.passives.forEach((def, i) => {
    const owned = player.passives.find((p) => p.def === i);
    if (owned) {
      if (owned.level < def.maxLevel) {
        candidates.push({ kind: 'passive', id: def.id, name: def.name, level: owned.level + 1, isNew: false });
      }
    } else if (player.passives.length < bal.maxPassives) {
      candidates.push({ kind: 'passive', id: def.id, name: def.name, level: 1, isNew: true });
    }
  });

  const picks: UpgradeChoice[] = [];
  while (picks.length < bal.choicesPerLevel && candidates.length > 0) {
    picks.push(candidates.splice(nextInt(rng, candidates.length), 1)[0]);
  }
  if (picks.length === 0) picks.push({ kind: 'heal', id: 'heal', name: '체력 회복', level: 0, isNew: false });
  return picks;
}

export function applyChoice(world: World, index: number): void {
  const choices = world.pendingChoices;
  if (!choices) return;
  const choice = choices[index];
  if (!choice) return;
  const { data, player } = world;

  if (choice.kind === 'weapon') {
    const def = data.weaponIndex[choice.id];
    const owned = player.weapons.find((w) => w.def === def);
    if (owned) owned.level = choice.level;
    else player.weapons.push({ def, level: 1, cooldown: 0 });
  } else if (choice.kind === 'passive') {
    const def = data.passiveIndex[choice.id];
    const owned = player.passives.find((p) => p.def === def);
    if (owned) owned.level = choice.level;
    else player.passives.push({ def, level: 1 });
    recomputeStats(player, data);
  } else {
    player.hp = Math.min(player.stats.maxHp, player.hp + player.stats.maxHp * 0.3);
  }
  world.pendingChoices = null;
}

/** 경험치를 레벨로 바꾸고, 대기 중인 레벨업이 있으면 3지선다를 연다. */
export function progression(world: World): void {
  const p = world.player;
  while (p.xp >= p.xpToNext) {
    p.xp -= p.xpToNext;
    p.level++;
    p.xpToNext = xpForLevel(world.data, p.level);
    world.pendingLevelUps++;
  }
  if (world.pendingLevelUps > 0 && !world.pendingChoices) {
    world.pendingLevelUps--;
    world.pendingChoices = generateChoices(world);
    world.events.push({ t: 'levelUp', level: p.level, choices: world.pendingChoices });
  }
}
