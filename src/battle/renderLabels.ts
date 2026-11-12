import * as THREE from 'three';

/** Canvas-backed, camera-facing labels. Text is drawn as text, never interpreted as HTML. */
export interface WorldLabel {
  sprite: THREE.Sprite;
  update(title: string, detail: string, color: number, progress?: number): void;
  dispose(): void;
}

export function createWorldLabel(width: number, height: number): WorldLabel {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false, fog: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(width, height, 1);
  sprite.renderOrder = 20;
  let last = '';

  return {
    sprite,
    update(title, detail, color, progress) {
      const fraction = progress === undefined ? undefined : THREE.MathUtils.clamp(progress, 0, 1);
      const key = `${title}|${detail}|${color}|${fraction === undefined ? '' : Math.round(fraction * 100)}`;
      if (!context || key === last) return;
      last = key;
      const c = context;
      const hex = `#${color.toString(16).padStart(6, '0')}`;
      c.clearRect(0, 0, canvas.width, canvas.height);
      c.beginPath();
      c.roundRect(5, 5, 502, 118, 19);
      c.fillStyle = 'rgba(10, 28, 28, 0.9)';
      c.fill();
      c.strokeStyle = hex;
      c.lineWidth = 3;
      c.stroke();
      c.fillStyle = hex;
      c.beginPath();
      c.arc(37, 42, 8, 0, Math.PI * 2);
      c.fill();
      c.textAlign = 'center';
      c.font = '700 31px system-ui, sans-serif';
      c.fillStyle = '#f2f0df';
      c.fillText(title, 270, 53, 425);
      c.font = '500 22px system-ui, sans-serif';
      c.fillStyle = '#bed0c7';
      c.fillText(detail, 256, 88, 460);
      if (fraction !== undefined) {
        c.fillStyle = '#344744';
        c.fillRect(23, 105, 466, 6);
        c.fillStyle = fraction < 0.28 ? '#f29683' : hex;
        c.fillRect(23, 105, 466 * fraction, 6);
      }
      texture.needsUpdate = true;
    },
    dispose() {
      sprite.removeFromParent();
      texture.dispose();
      material.dispose();
    },
  };
}
