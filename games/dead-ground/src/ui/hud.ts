import { RIFLE, type Player } from '../domain/combat.js';
import type { MatchEvent, Snapshot } from '../domain/match.js';
import { clamp, horizontalDistance } from '../domain/math.js';
import { LANDMARKS, type World } from '../domain/world.js';
import { element, notice, setText } from './elements.js';
import { Optics, TacticalMap } from './optics.js';

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const formatTime = (time: number) => {
  const seconds = Math.max(0, Math.ceil(time));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

export function renderStandings(parent: HTMLElement, players: readonly Player[], self: string): void {
  const rows = players.map(player => {
    const row = document.createElement('tr');
    row.classList.toggle('mine', player.id === self);
    const label = document.createElement('td');
    label.textContent = player.name;
    if (player.id === self) {
      const you = document.createElement('small');
      you.textContent = 'YOU';
      label.append(you);
    }
    row.append(label);
    for (const score of [player.kills, player.deaths, player.headshots]) {
      const cell = document.createElement('td');
      cell.textContent = String(score);
      row.append(cell);
    }
    return row;
  });
  parent.replaceChildren(...rows);
}

export class Hud {
  private readonly clock = element('clock');
  private readonly mode = element('mode-label');
  private readonly network = element('network-label');
  private readonly round = element('round-number');
  private readonly kills = element('kills-top');
  private readonly bearing = element('bearing-ticks');
  private readonly sector = element('sector-label');
  private readonly health = element('health');
  private readonly healthMeter = element('health-meter');
  private readonly healthBar = element('health-bar');
  private readonly protection = element('protection');
  private readonly breath = element('breath-bar');
  private readonly breathMeter = element('breath-meter');
  private readonly breathLabel = element('breath-status');
  private readonly ammo = element('ammo');
  private readonly reserve = element('reserve');
  private readonly cartridges = [...element('cartridges').children];
  private readonly glass = element<HTMLCanvasElement>('glass');
  private readonly hitMarker = element('hit-marker');
  private readonly hitFlash = element('hit-flash');
  private readonly hitNote = element('hit-note');
  private readonly combatStatus = element('combat-status');
  private readonly scopeReadout = element('scope-readout');
  private readonly scopeZoom = element('scope-zoom');
  private readonly scopeRange = element('scope-range');
  private readonly reticle = element('reticle');
  private readonly killfeed = element('killfeed');
  private readonly scoreboard = element('score-panel');
  private readonly scoreRows = element('score-rows');
  private readonly mapPanel = element('map-panel');
  private map?: TacticalMap;
  private lastHit = -Infinity;
  private lastDamage = -Infinity;
  private bearingWidth = 34;
  private bearingWidthAt = -Infinity;
  private lastFeed = '';
  private lastScore = '';

  constructor(private readonly world: World) {
    new Optics(this.glass);
    for (let n = -24; n <= 48; n++) {
      const tick = document.createElement('span');
      const degrees = (n * 15 + 360) % 360;
      tick.textContent = degrees % 45 ? String(degrees) : CARDINALS[degrees / 45];
      this.bearing.append(tick);
    }
  }

  reset(): void {
    this.lastHit = this.lastDamage = -Infinity;
    this.lastFeed = this.lastScore = '';
    this.killfeed.replaceChildren();
  }

  event(event: MatchEvent, self: string, now: number): void {
    if (event.type !== 'hit') return;
    if (event.target === self) this.lastDamage = now;
    if (event.player === self) {
      this.lastHit = now;
      setText(this.hitNote, event.headshot ? 'HEADSHOT' : event.lethal ? 'ELIMINATION' : 'HIT');
    }
  }

  range(distance: number): void {
    setText(this.scopeRange, Number.isFinite(distance) ? `${Math.max(1, Math.round(distance))} M` : '— M');
  }

  draw(snapshot: Snapshot, player: Player, now: number, aim: number, zoom: number,
    flags: { score: boolean; map: boolean; room?: string; latency?: number; fallback: boolean }): void {
    setText(this.clock, formatTime(snapshot.remaining));
    setText(this.mode, flags.room ? `ROOM ${flags.room}` : 'SOLO FIELD');
    setText(this.network, flags.room ? `${snapshot.players.length} ONLINE${flags.latency === undefined ? '' : ` · ${flags.latency} MS`}` : '5 AI OPPONENTS');
    setText(this.round, snapshot.round);
    setText(this.kills, player.kills);
    setText(this.health, player.health);
    this.healthBar.style.transform = `scaleX(${player.health / 100})`;
    this.healthMeter.setAttribute('aria-valuenow', String(player.health));
    this.healthBar.style.background = player.health < 40 ? '#d88964' : '';
    setText(this.ammo, String(player.ammo).padStart(2, '0'));
    setText(this.reserve, player.reserve);
    this.cartridges.forEach((item, index) => item.classList.toggle('empty', index >= player.ammo));
    this.protection.hidden = !player.alive || player.protectedUntil <= snapshot.time;
    this.breath.style.transform = `scaleX(${player.breath})`;
    this.breathMeter.setAttribute('aria-valuenow', String(Math.round(player.breath * 100)));
    this.breathMeter.setAttribute('aria-valuetext', `${Math.round(player.breath * 100)} percent${player.breathExhausted ? ', recovering' : ''}`);
    this.breathLabel.style.opacity = player.aiming ? '1' : '0.65';
    setText(this.breathLabel.firstElementChild as HTMLElement, player.steady ? 'STEADY' : player.breathExhausted && player.aiming ? 'RECOVER' : 'BREATH');

    const heading = (360 - player.yaw * 180 / Math.PI) % 360;
    if (now - this.bearingWidthAt > 500) {
      this.bearingWidth = this.bearing.firstElementChild?.getBoundingClientRect().width || 34;
      this.bearingWidthAt = now;
    }
    const width = this.bearingWidth;
    this.bearing.style.transform = `translateX(${-(24.5 + heading / 15) * width}px)`;
    const nearest = LANDMARKS.reduce((a, b) => horizontalDistance(a, player.position) < horizontalDistance(b, player.position) ? a : b);
    setText(this.sector, nearest.name);

    this.glass.style.opacity = String(clamp((aim - 0.25) / 0.55, 0, 1));
    this.reticle.style.opacity = player.alive ? String(1 - clamp(aim * 2, 0, 1)) : '0';
    this.scopeReadout.hidden = aim < 0.7 || !player.alive;
    setText(this.scopeZoom, `${zoom}×`);
    this.hitMarker.style.opacity = String(clamp(1 - (now - this.lastHit) / 300, 0, 1));
    this.hitNote.hidden = now - this.lastHit > 650;
    this.hitFlash.style.opacity = String(clamp(1 - (now - this.lastDamage) / 500, 0, 1));

    let status = '';
    if (!player.alive) status = `REDEPLOY IN ${Math.max(1, Math.ceil(player.respawnAt - snapshot.time))}`;
    else if (player.reloadUntil > snapshot.time) status = 'RELOADING';
    else if (player.boltUntil > snapshot.time && snapshot.time + RIFLE.cycle * 0.64 > player.boltUntil) status = 'CYCLING BOLT';
    else if (player.ammo === 0) status = player.reserve ? 'R · RELOAD' : 'OUT OF AMMO';
    else if (player.aiming && player.breath < 0.18 && (player.steady || player.breathExhausted)) {
      status = player.breathExhausted ? 'BREATH EMPTY · RELEASE SPACE TO RECOVER' : 'BREATH LOW · RELEASE SPACE TO RECOVER';
    }
    else if (flags.fallback) status = 'ARROW KEYS ALSO LOOK · ESC MENU';
    notice(this.combatStatus, status);

    const events = snapshot.events.filter(event => event.type === 'kill').slice(-4).reverse();
    const signature = events.map(event => event.serial).join();
    if (this.lastFeed !== signature) {
      this.lastFeed = signature;
      this.killfeed.replaceChildren(...events.map(event => {
        const item = document.createElement('li');
        const icon = document.createElement('b');
        icon.textContent = event.headshot ? 'HS' : '·';
        icon.title = event.headshot ? 'Headshot' : 'Elimination';
        item.classList.toggle('mine', event.player === player.id);
        item.append(event.attacker, icon, event.victim);
        return item;
      }));
    }

    this.scoreboard.hidden = !flags.score;
    if (flags.score) {
      const scoreSignature = snapshot.players.map(p => `${p.id}:${p.kills}:${p.deaths}:${p.headshots}`).join('|');
      if (scoreSignature !== this.lastScore) {
        this.lastScore = scoreSignature;
        renderStandings(this.scoreRows, snapshot.players, player.id);
      }
    }
    this.mapPanel.hidden = !flags.map || flags.score;
    if (!this.mapPanel.hidden) {
      this.map ??= new TacticalMap(element<HTMLCanvasElement>('tactical-map'), this.world);
      this.map.draw(player);
    }
  }
}
