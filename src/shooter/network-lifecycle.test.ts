import { describe, expect, it, vi } from 'vitest';
import { ShooterNet, type NetShot, type Pose } from './net';
import { ShooterRoomNet } from './room';

describe('ZERO ZONE disposed session guards', () => {
  it('does not accept duel packets or transmit after the match is disposed', () => {
    const send = vi.fn(), onPickup = vi.fn(), onStart = vi.fn(), onPose = vi.fn();
    const net = Object.create(ShooterNet.prototype) as ShooterNet;
    Object.assign(net, {
      dead: true, started: true, ch: { send }, lastPose: 0,
      session: { host: true }, hooks: { onPickup, onStart, onPose },
    });
    net['onMsg']({ t: 'pk', i: 32 });
    net['onMsg']({ t: 'hello' });
    net['onMsg']({ t: 'start' });
    net['hello']();
    net.sendPose({} as Pose, 1000);
    net.sendShot({} as NetShot);
    net.sendPickup(32);
    net.sendAck(20, false);
    net.sendDead(1);
    net.bye();
    expect(onPickup).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
    expect(onPose).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('validates duel pickup IDs before invoking gameplay callbacks', () => {
    const picked = vi.fn();
    const net = Object.create(ShooterNet.prototype) as ShooterNet;
    Object.assign(net, { dead: false, started: true, heard: 0, session: {host: false}, hooks: {onPickup: picked} });
    net['onMsg']({t: 'pk', i: 23.5});
    net['onMsg']({t: 'pk', i: -1});
    net['onMsg']({t: 'pk', i: 23});
    expect(picked).toHaveBeenCalledTimes(1);
    expect(picked).toHaveBeenCalledWith(23);
    Object.assign(net, {dead: true});
    net['onMsg']({t: 'pk', i: 24});
    expect(picked).toHaveBeenCalledTimes(1);
  });

  it('does not accept late multiplayer packets or outgoing updates after room closure', () => {
    const send = vi.fn(), onPickup = vi.fn(), onStart = vi.fn();
    const room = Object.create(ShooterRoomNet.prototype) as ShooterRoomNet;
    Object.assign(room, {
      dead: true, started: true, list: ['me', 'peer'],
      session: { me: { id: 'me' }, room: {host_id:'me'}, host:true },
      ids: ['me', 'peer'], heard: new Map(), gone: new Set(),
      ch: {send}, hooks: {onPickup, onStart},
    });
    room['onMsg']({t:'pk',f:'peer',i:22});
    room['onMsg']({t:'hello',f:'peer'});
    room['hello']();
    room['begin'](['me','peer']);
    room.sendPose({} as Pose, 1000);
    room.sendShot({} as NetShot);
    room.sendPickup(33);
    room.sendDead(0, 1);
    room.bye();
    expect(send).not.toHaveBeenCalled();
    expect(onPickup).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
  });

  it('retains valid room pickup events before disposal', () => {
    const picked = vi.fn(), room = Object.create(ShooterRoomNet.prototype) as ShooterRoomNet;
    Object.assign(room, {
      dead: false, started: true, list: ['me','peer'],
      session: {me:{id:'me'},room:{host_id:'me'},host:true},
      ids: ['me','peer'], heard: new Map([['peer',0]]), gone: new Set(),
      hooks: {onPickup: picked},
    });
    room['onMsg']({t:'pk',f:'peer',i:8.25});
    room['onMsg']({t:'pk',f:'peer',i:8});
    expect(picked).toHaveBeenCalledTimes(1);
    expect(picked).toHaveBeenCalledWith(8, 'peer');
  });
});
