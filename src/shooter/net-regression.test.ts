import { describe, expect, it } from 'vitest';
import { WEAPONS } from './config';
import { parseShot, plausiblePlayerShot, type NetShot } from './net';

const human = { x: 14, z: -7, air: 0 };
const shot = (w: NetShot['w'] = 'rifle'): NetShot => ({
  w, ox: 14, oy: 1.5, oz: -7,
  ends: Array.from({length: WEAPONS[w].pellets}, () => [27, 1.5, -7]).flat(),
});

describe('ZERO ZONE remote human shot authorization', () => {
  it('allows normal rifle and shotgun pellet counts in both online modes', () => {
    expect(plausiblePlayerShot(shot('rifle'), human)).toBe(true);
    expect(plausiblePlayerShot(shot('shotgun'), human)).toBe(true);
  });
  it('rejects weapon fire originating far away from the last known player pose', () => {
    expect(plausiblePlayerShot({...shot(),ox:115},human)).toBe(false);
    expect(plausiblePlayerShot({...shot(),oz:90},human)).toBe(false);
  });
  it('rejects shots fired from an impossible eye height or during parachuting', () => {
    expect(plausiblePlayerShot({...shot(),oy:50},human)).toBe(false);
    expect(plausiblePlayerShot(shot(),{...human,air:2})).toBe(false);
  });
  it('rejects altered pellet counts and endpoints beyond the weapon range', () => {
    const normal = shot('shotgun');
    expect(plausiblePlayerShot({...normal,ends:normal.ends.slice(3)},human)).toBe(false);
    const rifle = shot('rifle');
    expect(plausiblePlayerShot({...rifle,ends:[WEAPONS.rifle.range+100,1.5,0]},human)).toBe(false);
  });
  it('rejects non-finite coordinates even when called before packet parsing', () => {
    expect(plausiblePlayerShot({...shot(),ox:NaN},human)).toBe(false);
    expect(plausiblePlayerShot({...shot(),ends:[Infinity,0,0]},human)).toBe(false);
  });
  it('keeps accepting ordinary wire shots with rounded positions', () => {
    const normal = shot('rifle');
    const packet = parseShot({t:'sh',w:normal.w,ox:normal.ox,oy:normal.oy,oz:normal.oz,e:normal.ends});
    expect(packet).not.toBeNull();
    expect(plausiblePlayerShot(packet!,human)).toBe(true);
  });
});
