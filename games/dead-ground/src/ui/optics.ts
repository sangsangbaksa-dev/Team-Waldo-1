import type { Player } from '../domain/combat.js';
import { HALF_MAP, LANDMARKS, type World } from '../domain/world.js';

export class Optics {
  constructor(private readonly canvas: HTMLCanvasElement) {
    new ResizeObserver(() => this.paint()).observe(canvas);
  }

  private paint(): void {
    if (!this.canvas.clientWidth) return;
    const scale = Math.min(devicePixelRatio, 2);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.canvas.width = w * scale;
    this.canvas.height = h * scale;
    const ctx = this.canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    const x = w / 2, y = h / 2, radius = Math.min(h * 0.44, w * 0.45);
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = '#080a07';
    ctx.fill('evenodd');
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, 2 * Math.PI);
    ctx.clip();
    const rings = ctx.createRadialGradient(0, 0, radius * 0.67, 0, 0, radius);
    rings.addColorStop(0, '#24281900');
    rings.addColorStop(0.76, '#24281930');
    rings.addColorStop(0.95, '#12160bd9');
    rings.addColorStop(1, '#0f1109');
    ctx.fillStyle = rings;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.strokeStyle = '#c6ac7259';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, radius - 5.5, 0, 2 * Math.PI);
    ctx.stroke();

    const line = (x1: number, y1: number, x2: number, y2: number) => {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    };
    ctx.lineWidth = 1.15;
    ctx.strokeStyle = '#130f09e6';
    ctx.beginPath();
    line(-radius, 0, radius, 0);
    line(0, -radius, 0, radius);
    const spacing = radius * 0.071;
    for (let i = 1; i <= 8; i++) {
      const width = i % 2 ? 3 : 6;
      line(-i * spacing, -width, -i * spacing, width);
      line(i * spacing, -width, i * spacing, width);
      line(-width, i * spacing, width, i * spacing);
    }
    ctx.stroke();
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    line(-radius, 0, -radius * 0.65, 0);
    line(radius * 0.65, 0, radius, 0);
    line(0, -radius, 0, -radius * 0.65);
    line(0, radius * 0.65, 0, radius);
    ctx.stroke();
    ctx.fillStyle = '#db7847';
    ctx.beginPath();
    ctx.arc(0, 0, 1.45, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
  }
}

export class TacticalMap {
  private readonly backdrop: HTMLCanvasElement;

  constructor(private readonly canvas: HTMLCanvasElement, world: World) {
    this.backdrop = document.createElement('canvas');
    this.backdrop.width = canvas.width;
    this.backdrop.height = canvas.height;
    const { width, height } = this.backdrop;
    const ctx = this.backdrop.getContext('2d')!;
    const colors = ctx.createImageData(width, height);
    const toWorld = (pixel: number) => pixel * HALF_MAP * 2 / width - HALF_MAP;
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        const a = world.heightAt(toWorld(x), toWorld(z));
        const b = world.heightAt(toWorld(x + 1), toWorld(z + 1));
        const contour = Math.floor(a / 4) !== Math.floor(b / 4) ? 19 : 0;
        const tone = Math.max(0, Math.min(42, a * 0.58)) + contour;
        const offset = 4 * (z * width + x);
        colors.data.set([37 + tone, 39 + tone * 0.82, 29 + tone * 0.5, 255], offset);
      }
    }
    ctx.putImageData(colors, 0, 0);
    ctx.strokeStyle = '#bbac8541';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const p = i * width / 8;
      ctx.moveTo(p, 0); ctx.lineTo(p, height);
      ctx.moveTo(0, p); ctx.lineTo(width, p);
    }
    ctx.stroke();
    ctx.font = '500 10px Plex, monospace';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#222218';
    ctx.lineWidth = 3;
    ctx.fillStyle = '#f2d6a1';
    for (const { name, x, z } of LANDMARKS) {
      const px = this.pixel(x), pz = this.pixel(z);
      ctx.fillRect(px - 1, pz - 1, 3, 3);
      ctx.strokeText(name, px + 5, pz - 5);
      ctx.fillText(name, px + 5, pz - 5);
    }
    ctx.fillText('N', 18, 20);
    ctx.beginPath();
    ctx.moveTo(20, 28); ctx.lineTo(16, 37); ctx.lineTo(24, 37);
    ctx.fill();
    ctx.fillText('200 m', width - 102, height - 20);
    ctx.fillRect(width - 104, height - 13, width * 200 / (HALF_MAP * 2), 1);
  }

  draw(player: Player): void {
    const ctx = this.canvas.getContext('2d')!;
    ctx.drawImage(this.backdrop, 0, 0);
    ctx.save();
    ctx.translate(this.pixel(player.position.x), this.pixel(player.position.z));
    ctx.rotate(-player.yaw);
    ctx.fillStyle = '#ffd182';
    ctx.strokeStyle = '#251d10';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -10); ctx.lineTo(6.5, 7); ctx.lineTo(0, 4.2); ctx.lineTo(-6.5, 7);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  private pixel(value: number): number { return (value + HALF_MAP) * this.canvas.width / (HALF_MAP * 2); }
}
