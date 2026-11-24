import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = (path: string) => readFileSync(path, 'utf8');

describe('three-game HUD layout safeguards', () => {
  const city = css('src/city/hud-fixes.css');
  const shooter = css('src/shooter/shooter.css');
  const deadGround = css('games/dead-ground/src/ui/style.css');

  it('reserves independent City touch and vitals space on narrow portraits', () => {
    expect(city).toMatch(/\.touch \.c-bl\s*\{\s*width:calc\(100vw - 198px/);
    expect(city).toMatch(/\.touch \.c-fire\s*\{\s*bottom:calc\(var\(--hud-bottom\) \+ 164px\)/);
  });

  it('keeps City command lists scrollable and modal actions reachable', () => {
    expect(city).toMatch(/\.c-body\s*\{[^}]*touch-action:pan-y/);
    expect(city).toMatch(/\.c-modal section\s*\{[^}]*max-height:calc\(100dvh - 32px\)[^}]*overflow:auto/);
  });

  it('keeps the shooter landscape controls in four compact columns', () => {
    expect(shooter).toMatch(/\.touch \.sz-tbuttons\s*\{\s*grid-template-columns:repeat\(4,44px\)/);
    expect(shooter).toMatch(/\.touch \.sz-tbuttons button\.fire\s*\{\s*grid-column:span 1/);
  });

  it('allows the shooter setup and results to use two columns on phones', () => {
    expect(shooter).toMatch(/\.sz-setup \.sz-seg\.four\s*\{\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
    expect(shooter).toMatch(/\.sz-card \.sz-stats\s*\{\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  });

  it('keeps the Dead Ground compass separate from the feed on narrow screens', () => {
    expect(deadGround).toMatch(/\.navigation\s*\{\s*position:static; transform:none; grid-row:2; grid-column:1\/-1/);
    expect(deadGround).toMatch(/\.killfeed\s*\{\s*grid-column:2; grid-row:1/);
  });

  it('allows long player names to wrap and caps overlay height', () => {
    expect(deadGround).toMatch(/\.scoreboard th:first-child,\.scoreboard td:first-child\s*\{[^}]*overflow-wrap:anywhere/);
    expect(deadGround).toMatch(/\.modal,\.scoreboard\s*\{\s*max-height:calc\(100dvh/);
  });
});
