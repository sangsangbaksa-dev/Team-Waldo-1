import { ACTORS, FACTIONS, STRUCTS } from '../defs';
import type { AimTarget } from '../domain/aim-target';

/** Presentation only; the domain decides which entity is selected. */
export function aimLabel(target: AimTarget | null): string {
  if (!target) return '';
  if (target.kind === 'actor') {
    const a = target.entity;
    const color = a.f < 8 ? FACTIONS[a.f].color : a.f === 8 ? '#8fb0ff' : '#ccc';
    const name = (a.f < 8 ? FACTIONS[a.f].name + ' ' : '') + ACTORS[a.kind].name;
    return `<b style="color:${color}">${name}</b><i><u style="width:${Math.max(0, a.hp / a.maxHp * 100)}%;background:${a.f === 0 ? '#5dfc9b' : '#ff5d5d'}"></u></i>`;
  }
  const s = target.entity;
  return `<b style="color:${FACTIONS[s.f].color}">${FACTIONS[s.f].name} ${STRUCTS[s.kind].name}</b><i><u style="width:${Math.max(0, s.hp / s.maxHp * 100)}%"></u></i>`;
}
