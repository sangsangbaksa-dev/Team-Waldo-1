import { ghostAt } from './ghost';
import { minimapTransform } from './minimap';
import type { RaceState } from './race';
import type { Track } from './track';

type Transform = ReturnType<typeof minimapTransform>;

export class RaceMinimap {
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly background: HTMLCanvasElement;
  private transform: Transform;

  constructor(private readonly canvas: HTMLCanvasElement, track: Track) {
    this.ctx = canvas.getContext('2d');
    this.background = document.createElement('canvas');
    this.background.width = canvas.width;
    this.background.height = canvas.height;
    this.transform = minimapTransform(track.x, track.z, canvas.width);
    this.setTrack(track);
  }

  private x(x: number): number {
    return this.transform.x + (x - this.transform.minX) * this.transform.scale;
  }

  private z(z: number): number {
    return this.transform.z + (z - this.transform.minZ) * this.transform.scale;
  }

  setTrack(track: Track): void {
    this.transform = minimapTransform(track.x, track.z, this.canvas.width);
    const ctx = this.background.getContext('2d');
    if (!ctx) return;

    const path = new Path2D();
    for (let i = 0; i <= track.n; i++) {
      const j = i % track.n, x = this.x(track.x[j]), z = this.z(track.z[j]);
      if (i === 0) path.moveTo(x, z);
      else path.lineTo(x, z);
    }
    ctx.clearRect(0, 0, this.background.width, this.background.height);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(8,4,24,.8)';
    ctx.lineWidth = 9;
    ctx.stroke(path);
    ctx.strokeStyle = '#8f7dff';
    ctx.lineWidth = 4;
    ctx.stroke(path);
    ctx.fillStyle = '#fff';
    ctx.fillRect(this.x(track.x[0]) - 5, this.z(track.z[0]) - 2, 10, 4);
  }

  render(race: RaceState): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.background, 0, 0);

    const ghost = race.ghost && race.phase === 'racing' ? ghostAt(race.ghost, race.clock) : null;
    if (ghost) {
      ctx.beginPath();
      ctx.arc(this.x(ghost.x), this.z(ghost.z), 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#75e9ff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    for (let i = race.racers.length - 1; i >= 0; i--) {
      const racer = race.racers[i];
      ctx.fillStyle = racer.color;
      ctx.beginPath();
      ctx.arc(this.x(racer.car.x), this.z(racer.car.z), racer.player ? 6 : 4.5, 0, 7);
      ctx.fill();
      if (racer.player) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }
}
