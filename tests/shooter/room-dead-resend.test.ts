// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShooterRoomNet, type RoomHooks } from '../../src/shooter/room';
import type { RoomSession } from '../../src/net/lobby';
import type { NetMsg } from '../../src/net/types';

// 온라인 방: "쓰러졌다" 소식은 한 번 보내면 끝이라, 채널이 놓치면 남은 사람의 경기가 영원히 끝나지 않았습니다.
// 쓰러진 쪽이 2초마다 다시 보내고, 받는 쪽은 이미 처리한 소식을 무시해야 합니다.
function fake(): { net: ShooterRoomNet; sent: NetMsg[]; deliver: (m: NetMsg) => void; deaths: Array<[string, number]> } {
  const sent: NetMsg[] = []; let on: (m: NetMsg) => void = () => {}; const deaths: Array<[string, number]> = [];
  const session = {
    room: { host_id: 'a' }, me: { id: 'b' }, host: false, players: [{ id: 'a', nickname: 'A' }, { id: 'b', nickname: 'B' }, { id: 'c', nickname: 'C' }],
    open: (cb: (m: NetMsg) => void) => { on = cb; return { send: (m: NetMsg) => { sent.push(m); }, close: () => {}, ready: Promise.resolve() }; },
  } as unknown as RoomSession;
  const hooks: RoomHooks = { onStart: () => {}, onPose: () => {}, onShot: () => {}, onPickup: () => {}, onDead: (id, mt) => { deaths.push([id, mt]); }, onGone: () => {}, onAbort: () => {}, onData: () => {} };
  const net = new ShooterRoomNet(session, hooks);
  return { net, sent, deliver: m => on(m), deaths };
}

describe('ZERO ZONE 방: 쓰러짐 소식 재전송', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  it('쓰러진 뒤에는 keepalive 때마다 dead 를 다시 보낸다', () => {
    const { net, sent, deliver } = fake();
    deliver({ t: 'start', f: 'a', list: ['a', 'b', 'c'] }); expect(net.started).toBe(true);
    net.sendDead(61.234, 0, 2);
    const first = sent.filter(m => m.t === 'dead'); expect(first).toHaveLength(1);
    vi.advanceTimersByTime(9000);
    const all = sent.filter(m => m.t === 'dead'); expect(all.length).toBeGreaterThanOrEqual(4);
    expect(all.every(m => m.f === 'b' && m.mt === 61.23 && m.k === 0 && m.c === 2)).toBe(true);
    net.dispose();
  });
  it('쓰러지기 전에는 dead 를 보내지 않는다', () => {
    const { net, sent, deliver } = fake(); deliver({ t: 'start', f: 'a', list: ['a', 'b', 'c'] });
    vi.advanceTimersByTime(7000); expect(sent.some(m => m.t === 'dead')).toBe(false); net.dispose();
  });
});
