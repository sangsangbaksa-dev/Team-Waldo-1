import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sheets = ['slack.css', 'classroom.css', 'computer.css'] as const;
const styles = sheets.map(name => ({ name, css: readFileSync(new URL(`../../src/slack/${name}`, import.meta.url), 'utf8') }));
const keyframes = (css: string): string[] => [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map(match => match[1]!);

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
