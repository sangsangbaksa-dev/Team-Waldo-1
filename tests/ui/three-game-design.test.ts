import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('three arcade games: UI layout guardrails', () => {
  it('Speed Rush keeps portrait instruments in a grid and touch targets at least 44px high', () => {
    const css = read('src/race/race.css');
    expect(css).toMatch(/\.rc-hud\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
    expect(css).toMatch(/\.rc-btns\{grid-column:1\/-1;grid-row:2/);
    expect(css).toMatch(/\.rc-btns button,\.rc-btns \.rc-recover\{width:44px;height:44px/);
    expect(css).not.toContain('rc-track-flow');
  });

  it('Parry Gladiator preserves flat meter fills, visible focus and compact landscape controls', () => {
    const css = read('games/parry-gladiator/src/ui/style.css');
    expect(css).toContain('background: var(--meter-color);');
    expect(css).toContain('button:focus-visible');
    expect(css).toContain('@media(pointer:coarse) and (max-height:480px) and (orientation:landscape)');
    expect(css).toMatch(/\.clock strong\{font-family:var\(--condensed\)/);
  });

  it('Hustle places the destination and task in separate rows without revealing a hidden HUD', () => {
    const css = read('src/tycoon/tycoon.css');
    expect(css).toMatch(/\.ty-hud:not\(\[hidden\]\)\{display:grid/);
    expect(css).toMatch(/\.ty-task\{grid-column:2;grid-row:2\}/);
    expect(css).toMatch(/\.ty-route,\.ty-route\.has-task\{grid-column:2;grid-row:3\}/);
    expect(css).toContain('.ty-title.wd-screen[hidden],.ty-hud[hidden]{display:none}');
  });
});
