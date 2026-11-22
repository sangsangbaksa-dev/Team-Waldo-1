import {describe,expect,it} from 'vitest';
import {RecentRaceTrack} from '../../src/race/track-cache';
import {MAPS} from '../../src/race/maps';
import {raceDuelHeading,escapeRaceText} from '../../src/race/frame-plan';

describe('SPEED RUSH replay/restart track cache and PVP heading',()=>{
  it('reuses track arrays while repeatedly restarting the same map',()=>{
    const cache=new RecentRaceTrack();
    const track=cache.get(MAPS[0]);
    for(let i=0;i<20;i++)expect(cache.get(MAPS[0])).toBe(track);
    expect(track.n).toBeGreaterThan(300);
  });
  it('invalidates cached geometry when changing circuits',()=>{
    const cache=new RecentRaceTrack();
    const first=cache.get(MAPS[0]),second=cache.get(MAPS[1]);
    expect(first).not.toBe(second);
    expect(cache.get(MAPS[1])).toBe(second);
    const again=cache.get(MAPS[0]);
    expect(again).not.toBe(first);
    expect(again.x[15]).toBe(first.x[15]);
  });
  it('escapes multiplayer nicknames exactly once at the modal boundary',()=>{
    const raw=raceDuelHeading('Harbor',1,'<b>A&B</b>');
    const html=escapeRaceText(raw);
    expect(raw).toContain('<b>A&B</b>');
    expect(html).toContain('&lt;b&gt;A&amp;B&lt;/b&gt;');
    expect(html).not.toContain('&amp;lt;');
  });
});
