import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sheets = ['slack.css', 'classroom.css', 'computer.css'] as const;
const styles = sheets.map(name => ({ name, css: readFileSync(new URL(`../../src/slack/${name}`, import.meta.url), 'utf8') }));
const keyframes = (css: string): string[] => [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map(match => match[1]!);

describe('SLACK OFF small-screen game framing', () => {
  it('keeps target positions and score popups under one clamped scene coordinate', () => {
    const dorm = styles.find(s => s.name === 'computer.css')!.css;
    expect(dorm).toContain('.sc-game-scene .sc-target,.sc-game-scene .sc-pop');
    expect(dorm).toContain('left:clamp(31px,var(--star-x,50%),calc(100% - 31px))');
    expect(dorm).toContain('top:clamp(31px,var(--star-y,40%),calc(100% - 31px))');
  });
  it('places the portrait roommate below the monitor and uses a wider landscape screen', () => {
    const dorm = styles.find(s => s.name === 'computer.css')!.css;
    const shared = styles.find(s => s.name === 'slack.css')!.css;
    expect(dorm).toContain('.slack-computer .sc-monitor{top:max(126px,18%);height:61%}');
    expect(dorm).toContain('.slack-computer .sc-friend{bottom:2%;height:13%;min-height:44px}');
    expect(dorm).toContain('.slack-computer .sc-monitor{left:10%;top:27%;width:80%;height:69%;');
    expect(shared).toContain('.sl-tools button{white-space:nowrap;min-width:78px;');
  });
});

describe('SLACK OFF dorm hidden-app lifecycle', () => {
  it('pauses countdown animations while a mini-app is inactive', () => {
    const dorm = styles.find(s => s.name === 'computer.css')!.css;
    expect(dorm).toContain('.sc-app-window:not(.on) *{animation-play-state:paused!important}');
  });
});

describe('SLACK OFF animation isolation', () => {
  it('keeps animation names unique across lazy-loaded stage stylesheets', () => {
    // Stage CSS remains mounted after loading. A duplicate global @keyframes name
    // would silently replace the score-grade animation in the results overlay.
    const owners = new Map<string, string>();
    for (const sheet of styles) for (const name of keyframes(sheet.css)) {
      expect(owners.has(name), `${name} is defined in both ${owners.get(name)} and ${sheet.name}`).toBe(false);
      owners.set(name, sheet.name);
    }
    expect(owners.has('sl-pop')).toBe(true);
    expect(owners.has('sl-class-pop')).toBe(true);
  });
});

describe('SLACK OFF phone safe-area layout', () => {
  it('does not let the guard silhouette steal taps from taskbar apps', () => {
    const dorm = styles.find(s => s.name === 'computer.css')!.css;
    expect(dorm).toMatch(/\.sc-scan-person,\.sc-scan-person \*\{pointer-events:none\}/);
  });

  it('protects landscape HUD and dialog from left/right device cutouts', () => {
    const shared = styles.find(s => s.name === 'slack.css')!.css;
    expect(shared).toContain('padding-left:max(16px,env(safe-area-inset-left');
    expect(shared).toContain('padding-right:max(20px,env(safe-area-inset-right');
  });

  it('keeps the header, dialogs and stage cover controls clear of system UI', () => {
    const shared = styles.find(s => s.name === 'slack.css')!.css;
    const classroom = styles.find(s => s.name === 'classroom.css')!.css;
    const dorm = styles.find(s => s.name === 'computer.css')!.css;
    expect(shared).toContain('safe-area-inset-top');
    expect(shared).toContain('safe-area-inset-bottom');
    expect(classroom).toMatch(/\.sl-class \.sl-controls\s*\{[^}]*safe-area-inset-bottom/);
    expect(dorm).toMatch(/\.slack-computer \.sc-controls\s*\{[^}]*safe-area-inset-bottom/);
  });
});

describe('SLACK OFF keyboard and motion accessibility', () => {
  it('keeps the miniature classroom RTS toolbar labels legible on touch screens', () => {
    const classroom = styles.find(s => s.name === 'classroom.css')!.css;
    expect(classroom).toMatch(/\.sl-gbar button\{[^}]*font-size:clamp\(10px/);
  });

  it('provides a visible keyboard focus indicator in the dorm app controls', () => {
    const dorm = styles.find(s => s.name === 'computer.css')!.css;
    expect(dorm).toMatch(/\.slack-computer button:focus-visible/);
    expect(dorm).toMatch(/outline:\s*2px solid/);
  });

  it('honors reduced-motion settings in both the classroom and dorm animations', () => {
    for (const sheet of styles.filter(s => s.name !== 'slack.css')) {
      expect(sheet.css, sheet.name).toMatch(/prefers-reduced-motion:\s*reduce/);
      expect(sheet.css, sheet.name).toMatch(/animation-duration:\s*\.01ms\s*!important/);
    }
  });
});
