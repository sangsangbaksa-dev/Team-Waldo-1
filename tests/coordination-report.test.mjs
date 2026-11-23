import { describe, expect, it } from 'vitest';
import { analyzePullRequests, gameForPath, renderMarkdown } from '../tools/coordination-report.mjs';

const NOW = Date.parse('2026-11-23T02:00:00Z');

const prs = [
  { number: 195, title: '9 and 10 base', base: { ref: 'feat/shared-menu-rails' }, head: { ref: 'agent/9-10' }, updated_at: '2026-11-22T22:00:00Z', files: ['src/slack/game.ts', 'src/squad/game.ts'] },
  { number: 202, title: 'SLACK', base: { ref: 'agent/9-10' }, head: { ref: 'fix/slack' }, updated_at: '2026-11-23T01:55:00Z', files: ['src/slack/game.ts', 'tests/slack/lifecycle.test.ts'] },
  { number: 208, title: 'SKY', base: { ref: 'agent/9-10' }, head: { ref: 'agent/sky' }, updated_at: '2026-11-23T01:00:00Z', files: ['src/sky/game.ts'] },
  { number: 199, title: 'ZERO relief', base: { ref: 'feat/shared-menu-rails' }, head: { ref: 'feat/relief' }, updated_at: '2026-11-22T20:00:00Z', files: ['src/shooter/world.ts', 'src/shooter/relief.ts'] },
  { number: 207, title: 'ZERO city', base: { ref: 'claude/project-thread-hhffi5' }, head: { ref: 'feat/city' }, updated_at: '2026-11-23T01:58:00Z', files: ['src/shooter/world.ts', 'src/shooter/terrain.ts', 'src/shooter/world.ts'] },
];

describe('Team Waldo coordinator: GitHub PR file overlap', () => {
  it('classifies every game namespace without treating shared runtime as a game', () => {
    expect(gameForPath('src/city/game.ts')).toBe('LAST CITY');
    expect(gameForPath('src/race/view.ts')).toBe('SPEED RUSH');
    expect(gameForPath('src/rts/models.ts')).toBe('FRONTLINE');
    expect(gameForPath('src/shooter/world.ts')).toBe('ZERO ZONE');
    expect(gameForPath('src/outlaw/game.ts')).toBe('OUTLAW CITY');
    expect(gameForPath('src/tycoon/game.ts')).toBe('HUSTLE');
    expect(gameForPath('src/sky/game.ts')).toBe('SKY WAR');
    expect(gameForPath('src/squad/game.ts')).toBe('SQUAD CLASH');
    expect(gameForPath('tests/slack/audio.test.ts')).toBe('SLACK OFF');
    expect(gameForPath('room-tone/index.html')).toBe('ROOM TONE');
    expect(gameForPath('src/shared/lod.ts')).toBe(null);
  });

  it('detects stacked PRs, exact filename overlaps and divergent baselines', () => {
    const result = analyzePullRequests(prs, { target: 'feat/shared-menu-rails', now: NOW });
    expect(result.total).toBe(5);
    expect(result.parentEdges).toEqual([
      { parent: 195, child: 202, branch: 'agent/9-10' },
      { parent: 195, child: 208, branch: 'agent/9-10' },
    ]);
    expect(result.exactFileCollisions).toEqual([
      { filename: 'src/shooter/world.ts', prs: [199, 207] },
      { filename: 'src/slack/game.ts', prs: [195, 202] },
    ]);
    expect(result.collisionPairs.map(x => [x.first, x.second])).toEqual([[195, 202], [199, 207]]);
    expect(result.foreignBases).toEqual([
      { number: 202, base: 'agent/9-10', stackedOn: 195 },
      { number: 207, base: 'claude/project-thread-hhffi5', stackedOn: null },
      { number: 208, base: 'agent/9-10', stackedOn: 195 },
    ]);
    expect(result.multipleGames).toEqual([{ number: 195, games: ['SLACK OFF', 'SQUAD CLASH'] }]);
    expect(result.recentlyUpdated).toEqual([202, 207]);
  });

  it('does not treat unrelated game files as collisions or mutate inputs', () => {
    const input = [
      { number: 1, base: 'feat/shared-menu-rails', head: 'a', files: ['src/city/a.ts'] },
      { number: 2, base: 'feat/shared-menu-rails', head: 'b', files: ['src/race/a.ts'] },
      { number: 3, base: 'feat/shared-menu-rails', head: 'c', files: [] },
    ];
    const before = JSON.stringify(input);
    const result = analyzePullRequests(input, { now: NOW });
    expect(result.exactFileCollisions).toEqual([]);
    expect(result.parentEdges).toEqual([]);
    expect(result.missingFileLists).toEqual([3]);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('formats a readable issue-ready report with link, overlap and scope caution', () => {
    const result = analyzePullRequests(prs, { now: NOW });
    const text = renderMarkdown(result, 'sangsangbaksa-dev/Team-Waldo-1');
    expect(text).toContain('## 파일 변경이 겹치는 PR');
    expect(text).toContain('[#199](https://github.com/sangsangbaksa-dev/Team-Waldo-1/pull/199)');
    expect(text).toContain('src/shooter/world.ts');
    expect(text).toContain('실제 diff');
    expect(text.endsWith('\n')).toBe(true);
  });
});
