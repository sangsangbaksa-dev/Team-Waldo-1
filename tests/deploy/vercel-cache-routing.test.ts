import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface HeaderRule {
  source: string;
  headers: Array<{ key: string; value: string }>;
}
interface VercelConfig {
  git: { deploymentEnabled: boolean };
  headers: HeaderRule[];
}
const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8')) as VercelConfig;

describe('Vercel static asset cache routing', () => {
  const roomTone = config.headers.find(rule => rule.source.startsWith('/room-tone/'));
  it('matches real ROOM TONE extensions with exactly one regex escape', () => {
    expect(roomTone).toBeDefined();
    const regex = new RegExp('^' + roomTone!.source + '$');
    for (const url of [
      '/room-tone/room-tone.glb',
      '/room-tone/soundtrack.mp3',
      '/room-tone/effect.ogg',
      '/room-tone/ambient.wav',
      '/room-tone/menu.png',
      '/room-tone/cover.jpg',
    ]) expect(regex.test(url)).toBe(true);
    expect(regex.test('/room-tone/index.html')).toBe(false);
    expect(regex.test('/room-tone/somethingxglb')).toBe(false);
  });

  it('keeps cache headers enabled and Git push auto-deploy disabled', () => {
    expect(roomTone?.headers.some(header =>
      header.key.toLowerCase() === 'cache-control' &&
      /max-age=\d+/.test(header.value)
    )).toBe(true);
    expect(config.git.deploymentEnabled).toBe(false);
  });
});
