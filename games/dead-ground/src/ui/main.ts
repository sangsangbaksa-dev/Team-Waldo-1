import './style.css';
import { callsign, roomCode, type ClientMessage } from '../application/protocol.js';
import { SoloSession, type Session } from '../application/session.js';
import { movePlayer, type Input, type Movement, type Player } from '../domain/combat.js';
import type { Snapshot } from '../domain/match.js';
import { horizontalDistance, lerp } from '../domain/math.js';
import { createWorld, type World } from '../domain/world.js';
import { FieldAudio } from '../infrastructure/audio.js';
import { OnlineSession } from '../infrastructure/online.js';
import { FieldRenderer } from '../infrastructure/renderer.js';
import { Controls } from './controls.js';
import { element, notice, setText } from './elements.js';
import { Hud, renderStandings } from './hud.js';

type Panel = 'online' | 'room' | 'pause' | 'controls' | 'result';

const panelNames: Panel[] = ['online', 'room', 'pause', 'controls', 'result'];
const cfg = (key: string) => {
  try { return localStorage.getItem(`dead-ground.${key}`); }
  catch { return null; }
};
function remember(key: string, value: string): void {
  try { localStorage.setItem(`dead-ground.${key}`, value); }
  catch { /* Storage is optional for play. */ }
}

class Game {
  private readonly landing = element('landing');
  private readonly field = element('field');
  private readonly canvas = element<HTMLCanvasElement>('game');
  private readonly overlay = element('overlay');
  private readonly name = element<HTMLInputElement>('callsign');
  private readonly code = element<HTMLInputElement>('room-code');
  private readonly createRoom = element<HTMLButtonElement>('create-room');
  private readonly joinRoom = element<HTMLButtonElement>('join-form').querySelector('button')!;
  private readonly startRoom = element<HTMLButtonElement>('start-room');
  private readonly rematch = element<HTMLButtonElement>('rematch');
  private readonly roster = element('roster');
  private readonly lowDetail = element<HTMLInputElement>('low-detail');
  private readonly audio = new FieldAudio();
  private readonly controls = new Controls(this.canvas, () => this.pause());

  private session?: Session;
  private world?: World;
  private renderer?: FieldRenderer;
  private hud?: Hud;
  private panel?: Panel;
  private panelBeforeGuide?: Panel;
  private previousPhase?: Snapshot['phase'];
  private generation = -1;
  private latestEvent = 0;
  private seenSnapshot?: Snapshot;
  private drawnLobby = '';
  private resultsHost?: string;
  private prediction?: Movement;
  private predictionSnapshot?: Snapshot;
  private onField = false;
  private rangeAt = 0;
  private lastFrame = 0;

  constructor() {
    this.name.value = callsign(cfg('name') ?? 'NOMAD');
    const sensitivity = element<HTMLInputElement>('sensitivity');
    sensitivity.value = cfg('sensitivity') ?? '1';
    this.controls.sensitivity = sensitivity.valueAsNumber;
    const mute = element<HTMLInputElement>('mute');
    mute.checked = cfg('muted') === '1';
    this.audio.setMuted(mute.checked);
    this.lowDetail.checked = cfg('performance') === '1';
    sensitivity.addEventListener('input', () => {
      this.controls.sensitivity = sensitivity.valueAsNumber;
      remember('sensitivity', sensitivity.value);
    });
    mute.addEventListener('change', () => {
      this.audio.setMuted(mute.checked);
      remember('muted', mute.checked ? '1' : '0');
    });
    this.lowDetail.addEventListener('change', () => {
      this.renderer?.setQuality(this.lowDetail.checked);
      remember('performance', this.lowDetail.checked ? '1' : '0');
    });
    this.name.addEventListener('change', () => this.playerName());
    this.code.addEventListener('input', () => { this.code.value = roomCode(this.code.value); });
    element('solo').addEventListener('click', () => this.deploySolo());
    element('multiplayer').addEventListener('click', () => {
      notice(element('menu-status'));
      notice(element('online-status'));
      this.show('online');
    });
    this.createRoom.addEventListener('click', () => this.connect({ type: 'create', name: this.playerName() }));
    element('join-form').addEventListener('submit', event => {
      event.preventDefault();
      const code = roomCode(this.code.value);
      if (code.length !== 5) {
        notice(element('online-status'), 'Enter the five-character room code.');
        return;
      }
      this.connect({ type: 'join', name: this.playerName(), code });
    });
    element('online-back').addEventListener('click', () => this.leave());
    this.startRoom.addEventListener('click', () => this.session?.restart());
    element('resume').addEventListener('click', () => this.resume());
    this.rematch.addEventListener('click', () => {
      if (!this.session) return;
      this.session.restart();
      if (!this.session.room) {
        const state = this.session.snapshot;
        if (state) this.openField(state);
        this.resume();
      }
    });
    element('copy-code').addEventListener('click', () => void this.copyRoomCode());
    for (const button of document.querySelectorAll('[data-leave]')) button.addEventListener('click', () => this.leave());
    for (const button of document.querySelectorAll('[data-guide]')) button.addEventListener('click', () => {
      this.panelBeforeGuide = this.panel;
      this.show('controls');
    });
    element('close-guide').addEventListener('click', () => this.show(this.panelBeforeGuide));
    window.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (this.panel === 'controls') this.show(this.panelBeforeGuide);
      else if (this.panel === 'online') this.leave();
    });
    requestAnimationFrame(this.frame);
  }

  private playerName(): string {
    this.name.value = callsign(this.name.value);
    remember('name', this.name.value);
    return this.name.value;
  }

  private show(panel?: Panel): void {
    if (this.panel === panel && this.overlay.hidden === !panel) return;
    this.panel = panel;
    this.overlay.hidden = !panel;
    this.landing.inert = Boolean(panel);
    for (const name of panelNames) element(`${name}-panel`).hidden = name !== panel;
    if (panel) {
      element(`${panel}-panel`).querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled)')?.focus();
    }
  }

  private deploySolo(): void {
    notice(element('menu-status'));
    const world = this.world ??= createWorld();
    this.session = new SoloSession(world, this.playerName());
    const snapshot = this.session.snapshot;
    if (snapshot && this.openField(snapshot)) this.resume();
  }

  private connect(request: Extract<ClientMessage, { type: 'create' | 'join' }>): void {
    this.session?.close();
    this.session = new OnlineSession(request, this.world ??= createWorld());
    this.onlineBusy(true);
    notice(element('online-status'), 'Connecting…');
  }

  private onlineBusy(busy: boolean): void {
    this.createRoom.disabled = this.joinRoom.disabled = busy;
  }

  private async copyRoomCode(): Promise<void> {
    if (!this.session?.room) return;
    try {
      await navigator.clipboard.writeText(this.session.room.code);
      setText(element('copy-label'), 'COPIED');
    } catch {
      setText(element('copy-label'), 'SHARE THIS CODE');
    }
  }

  private pause(): void {
    if (!this.onField || this.panel === 'result') return;
    this.controls.disable();
    this.audio.ambiance(false);
    const online = !!this.session?.room;
    setText(element('pause-kicker'), online ? `ROOM ${this.session?.room?.code}` : 'SOLO FIELD');
    setText(element('pause-note'), online ? 'The online round continues while this menu is open.' : 'Resume when you’re ready.');
    this.show('pause');
  }

  private resume(): void {
    this.show();
    this.controls.enable();
    this.audio.unlock();
    this.audio.ambiance(true);
  }

  private leave(message = ''): void {
    this.session?.close();
    this.session = undefined;
    this.controls.disable();
    this.audio.ambiance(false);
    this.renderer?.reset();
    this.hud?.reset();
    this.field.hidden = true;
    this.landing.hidden = false;
    this.onField = false;
    this.previousPhase = undefined;
    this.generation = -1;
    this.latestEvent = 0;
    this.seenSnapshot = undefined;
    this.predictionSnapshot = undefined;
    this.prediction = undefined;
    this.drawnLobby = '';
    this.onlineBusy(false);
    this.show();
    notice(element('menu-status'), message);
  }

  private openField(snapshot: Snapshot): boolean {
    const self = snapshot.players.find(player => player.id === this.session?.playerId);
    if (!self) return false;
    this.field.hidden = false;
    this.landing.hidden = true;
    try {
      const world = this.world ??= createWorld();
      this.renderer ??= new FieldRenderer(this.canvas, world);
      this.hud ??= new Hud(world);
      this.renderer.setQuality(this.lowDetail.checked);
    } catch {
      this.leave('Dead Ground needs WebGL 2. Enable hardware acceleration or try a desktop browser.');
      return false;
    }
    this.onField = true;
    this.generation = -1;
    this.controls.orient(self.yaw, self.pitch);
    this.prediction = undefined;
    this.predictionSnapshot = undefined;
    this.previousPhase = 'active';
    this.renderer.reset();
    this.hud.reset();
    return true;
  }

  private lobby(state: Snapshot): void {
    const session = this.session;
    if (!session?.room) return;
    const { code, host, self } = session.room;
    if (this.onField) {
      this.onField = false;
      this.controls.disable();
      this.audio.ambiance(false);
      this.field.hidden = true;
      this.landing.hidden = false;
    }
    this.show('room');
    this.previousPhase = 'lobby';
    const next = `${code}|${host}|${state.players.map(player => player.id).join()}`;
    if (this.drawnLobby === next) return;
    if (element('assigned-code').textContent !== code) setText(element('copy-label'), 'COPY CODE');
    this.drawnLobby = next;
    setText(element('assigned-code'), code);
    const hosting = self === host;
    this.startRoom.disabled = !hosting || state.players.length < 2;
    this.startRoom.hidden = !hosting;
    notice(element('lobby-status'), state.players.length < 2 ? 'Waiting for at least one more player.'
      : hosting ? `${state.players.length} of 6 operators ready.` : 'Waiting for the host to start the round.');
    this.roster.replaceChildren(...state.players.map(player => {
      const row = document.createElement('li');
      const role = document.createElement('span');
      role.textContent = [player.id === host && 'HOST', player.id === self && 'YOU'].filter(Boolean).join(' · ');
      row.append(player.name, role);
      return row;
    }));
  }

  private results(snapshot: Snapshot): void {
    this.previousPhase = 'finished';
    this.resultsHost = this.session?.room?.host;
    this.controls.disable();
    this.audio.ambiance(false);
    const winner = snapshot.players[0];
    const tied = winner && snapshot.players.filter(player => player.kills === winner.kills
      && player.deaths === winner.deaths && player.headshots === winner.headshots);
    setText(element('round-winner'), tied && tied.length > 1 ? `Tie at ${winner.kills} eliminations.`
      : winner ? `${winner.name} wins with ${winner.kills} eliminations.` : 'The round has ended.');
    renderStandings(element('result-rows'), snapshot.players, this.session?.playerId ?? '');
    const room = this.session?.room;
    const canRestart = !room || room.host === room.self;
    this.rematch.hidden = !canRestart;
    notice(element('rematch-note'), canRestart ? '' : 'Waiting for the host to start a rematch.');
    this.show('result');
  }

  private predict(player: Player, input: Input, snapshot: Snapshot, dt: number, latency: number): Player {
    const world = this.world!;
    if (!this.prediction || !player.alive) this.prediction = player;
    if (snapshot !== this.predictionSnapshot && player.alive) {
      const lead = Math.min(0.09, latency / 2000 + 0.021);
      const target = movePlayer(world, player, input, lead);
      const distance = horizontalDistance(this.prediction.position, target.position);
      const blend = distance > 3.5 ? 1 : 0.25;
      const x = lerp(this.prediction.position.x, target.position.x, blend);
      const z = lerp(this.prediction.position.z, target.position.z, blend);
      this.prediction = { ...this.prediction, position: { x, y: world.heightAt(x, z), z },
        height: lerp(this.prediction.height, player.height, blend) };
      this.predictionSnapshot = snapshot;
    }
    if (player.alive) this.prediction = movePlayer(world, this.prediction, input, dt);
    return { ...player, ...this.prediction, alive: player.alive, yaw: input.yaw, pitch: input.pitch,
      aiming: input.aim, steady: input.aim && input.breath && !player.breathExhausted };
  }

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.065, Math.max(0, (now - (this.lastFrame || now)) / 1000));
    this.lastFrame = now;
    const session = this.session;
    if (!session) return;
    if (session.error) {
      if (this.panel === 'online') {
        const error = session.error;
        session.close();
        this.session = undefined;
        this.onlineBusy(false);
        notice(element('online-status'), error);
      } else this.leave(session.error);
      return;
    }
    const received = session.snapshot;
    const current = received?.players.find(player => player.id === session.playerId);
    if (this.onField && current && current.generation !== this.generation) {
      this.generation = current.generation;
      this.controls.orient(current.yaw, current.pitch);
      this.prediction = undefined;
    }
    const input = this.controls.sample(dt);
    if (session.room || this.controls.active) session.update(input, dt);
    const snapshot = session.room || !this.controls.active ? received : session.snapshot;
    if (!snapshot) return;
    if (snapshot.phase === 'lobby') {
      this.lobby(snapshot);
      return;
    }
    if (snapshot.phase === 'active' && this.previousPhase !== 'active') {
      if (!this.openField(snapshot)) return;
      this.pause();
    }
    if (snapshot.phase === 'finished' && (this.previousPhase !== 'finished' || this.resultsHost !== session.room?.host)) this.results(snapshot);
    const auth = snapshot.players.find(other => other.id === session.playerId);
    if (!auth || !this.renderer || !this.hud) return;
    if (auth.generation !== this.generation) {
      this.generation = auth.generation;
      this.controls.orient(auth.yaw, auth.pitch);
      input.yaw = auth.yaw;
      input.pitch = auth.pitch;
      this.prediction = undefined;
    }
    const shown = session.room && snapshot.phase === 'active' ? this.predict(auth, input, snapshot, dt, session.latency ?? 0)
      : this.controls.active ? { ...auth, aiming: input.aim && auth.alive, yaw: input.yaw, pitch: input.pitch } : auth;
    if (this.seenSnapshot !== snapshot) {
      this.seenSnapshot = snapshot;
      for (const event of snapshot.events) {
        if (event.serial <= this.latestEvent) continue;
        this.latestEvent = event.serial;
        this.hud.event(event, session.playerId, now);
        this.renderer.event(event, session.playerId);
        if (this.controls.active) this.audio.event(event, session.playerId, auth.position, shown.yaw);
      }
    }
    if (shown.alive && shown.moving && this.controls.active) this.audio.footstep(now / 1000, shown.sprinting, shown.crouched);
    // Keep the menu backdrop alive at a lower frame rate.
    if (!this.controls.active && Math.floor(now / 65) === Math.floor((now - dt * 1000) / 65) && dt > 0) return;
    this.renderer.draw(snapshot, shown, this.controls.zoom, dt, now, Boolean(session.room));
    if (shown.aiming && now >= this.rangeAt) {
      const line = this.renderer.rangeLine;
      this.hud.range(this.world!.trace(line.from, line.to) * 600);
      this.rangeAt = now + 145;
    }
    this.hud.draw(snapshot, shown, now, this.renderer.aimFraction, this.controls.zoom, {
      score: this.controls.score, map: this.controls.map, room: session.room?.code, latency: session.latency,
      fallback: this.controls.active && this.controls.fallback,
    });
  };
}

new Game();
