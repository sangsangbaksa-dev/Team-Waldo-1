import * as THREE from 'three';

// 단색 상자였던 현금·방탄복·구급 키트를 그린 그림 면으로 바꿉니다. 모양과 크기(판정)는 그대로 두고 면 무늬만 입힙니다.
export type LootArt = 'cash' | 'armor' | 'medkit';

const cache = new Map<LootArt, THREE.CanvasTexture>();

function draw(kind: LootArt, g: CanvasRenderingContext2D, S: number): void {
  const edge = (c: string, w = 6): void => { g.strokeStyle = c; g.lineWidth = w; g.lineJoin = 'round'; };
  if (kind === 'cash') {
    const grd = g.createLinearGradient(0, 0, S, S); grd.addColorStop(0, '#7fd89a'); grd.addColorStop(1, '#2f9a58');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    edge('#1d5c34', 8); g.strokeRect(10, 10, S - 20, S - 20);
    edge('#b8f0c8', 3); g.strokeRect(22, 22, S - 44, S - 44);
    g.fillStyle = '#e9ffe9'; g.beginPath(); g.arc(S / 2, S / 2, S * 0.24, 0, 7); g.fill(); edge('#1d5c34', 4); g.stroke();
    g.fillStyle = '#1d5c34'; g.font = `900 ${S * 0.34}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', S / 2, S / 2 + 3);
  } else if (kind === 'armor') {
    g.fillStyle = '#3d5a8c'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#4f74b4'; for (let y = 0; y < S; y += 32) g.fillRect(0, y, S, 14);
    g.beginPath(); g.moveTo(S * 0.5, S * 0.12); g.lineTo(S * 0.82, S * 0.26); g.lineTo(S * 0.78, S * 0.6); g.quadraticCurveTo(S * 0.7, S * 0.82, S * 0.5, S * 0.9);
    g.quadraticCurveTo(S * 0.3, S * 0.82, S * 0.22, S * 0.6); g.lineTo(S * 0.18, S * 0.26); g.closePath();
    g.fillStyle = '#9cc4ff'; g.fill(); edge('#142a4a', 7); g.stroke();
    g.fillStyle = '#e8f2ff'; g.fillRect(S * 0.46, S * 0.3, S * 0.08, S * 0.42); g.fillRect(S * 0.32, S * 0.44, S * 0.36, S * 0.08);
  } else {
    g.fillStyle = '#f4efe6'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#d9d2c4'; g.fillRect(0, S - 24, S, 24);
    edge('#7c1c24', 8); g.strokeRect(8, 8, S - 16, S - 16);
    g.fillStyle = '#d8433b'; g.fillRect(S * 0.42, S * 0.2, S * 0.16, S * 0.6); g.fillRect(S * 0.2, S * 0.42, S * 0.6, S * 0.16);
    g.fillStyle = '#ff9a94'; g.fillRect(S * 0.42, S * 0.2, S * 0.16, S * 0.06);
  }
}

/** 종류별로 한 번만 만들어 모든 아이템이 같은 텍스처를 씁니다. */
export function lootTexture(kind: LootArt): THREE.CanvasTexture {
  let t = cache.get(kind);
  if (!t) {
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S; draw(kind, c.getContext('2d')!, S);
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; cache.set(kind, t);
  }
  return t;
}

export function lootArt(type: string): LootArt | null {
  return type === 'cash' || type === 'armor' || type === 'medkit' ? type : null;
}

export function disposeLootTextures(): void { for (const t of cache.values()) t.dispose(); cache.clear(); }
