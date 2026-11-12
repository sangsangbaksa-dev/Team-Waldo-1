import {describe,expect,it} from 'vitest';
import {createWarAudio} from '../../src/battle/audio';

describe('optional procedural game audio',()=>{
 it('can be muted and disposed without AudioContext support',()=>{
  const sound=createWarAudio();
  expect(sound.getMuted()).toBe(false);
  expect(sound.toggle()).toBe(true);
  sound.play('command');
  sound.play('capture');
  expect(sound.toggle()).toBe(false);
  sound.dispose();
 });
});
