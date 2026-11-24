import type { SkySim, Jet } from '../sim';
import { svgIcon } from '../art';
export type Lookup = <T extends HTMLElement>(id: string) => T;
export function createSkyHud($: Lookup) {
  const html = new WeakMap<HTMLElement, string>();
  function setHtml(el: HTMLElement, value: string): void {
    if (html.get(el) !== value) { html.set(el, value); el.innerHTML = value; }
  }
  const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
  return (sim: SkySim, p: Jet, throttle: number): void => {
    $('sk-score').textContent = String(sim.score); $('sk-combo').textContent = sim.combo > 1 ? ` ×${sim.combo}` : '';
    $('sk-wave').textContent = `WAVE ${Math.max(1, sim.wave)} · 적 ${sim.enemies().length}`;
    $('sk-hp').style.width = `${Math.max(0, p.hp / p.maxHp * 100)}%`; $('sk-hp').parentElement!.classList.toggle('low', p.hp < 30);
    $('sk-heat').style.width = `${clamp(p.heat / 1.2 * 100, 0, 100)}%`; $('sk-heat').parentElement!.classList.toggle('hot', p.heat > 0.9);
    $('sk-spd').textContent = String(Math.round(p.speed * 3.6)) + ' · ' + p.g.toFixed(1) + 'G';
    $('sk-alt').textContent = String(Math.round(p.pos.y));
    setHtml($('sk-mis'), p.missiles > 0 ? svgIcon('missile', 'sk-ic mini').repeat(Math.min(p.missiles, 12)) : '—');
    setHtml($('sk-status'), [sim.shield > 0 ? `${svgIcon('shield')}${Math.ceil(sim.shield)}` : '', sim.overdrive > 0 ? `${svgIcon('bolt')}${sim.overdrive.toFixed(1)}s` : ''].filter(Boolean).join(' '));
    $('sk-fuel').style.width = `${p.fuel * 100}%`;
    $('sk-thr').style.width = `${throttle * 100}%`;
  };
}
