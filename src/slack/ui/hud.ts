import type { SlackState } from '../domain/contracts';
type Lookup = <T extends HTMLElement>(selector: string) => T;
export function renderSlackHud($: Lookup, s: SlackState): void {
  const left = Math.max(0, Math.ceil(s.limit - s.time));
  $('[data-time]').textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  $('[data-fun]').textContent = `${Math.round(s.fun)} / ${Math.round(s.goal)}`; $('[data-fun-bar]').style.width = `${Math.min(100, s.fun)}%`; $('[data-goal]').style.left = `${Math.min(100, s.goal)}%`;
  $('[data-strikes]').textContent = String(s.strikes); $('[data-pips]').querySelectorAll('i').forEach((p, i) => p.classList.toggle('on', i < s.strikes));
  $('[data-battery]').textContent = String(Math.round(s.battery)); $('[data-battery-chip]').classList.toggle('low', s.battery < 25); $('[data-combo]').textContent = String(s.combo);
  $('[data-risk]').style.width = `${Math.max(0, Math.min(100, s.sus))}%`; $('[data-risk-chip]').classList.toggle('hot', s.sus > 70);
}
