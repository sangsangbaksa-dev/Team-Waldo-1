import { describe, expect, it } from 'vitest';
import { Scene, LineSegments, BufferGeometry, Material } from 'three';
import { Atmosphere } from '../../src/tycoon/scene/sky';

type RainProbe = {
  scene: Scene; quality: 'high' | 'low'; time: number;
  rain: LineSegments | null; rainU: Record<string, {value: unknown}> | null;
  createRain: () => void;
};

describe('HUSTLE lazy weather buffers', () => {
  it.each([['low', 900], ['high', 2600]] as const)(
    'only creates %s rain geometry on first rainy frame (%i strips)', (quality, strips) => {
      // Access the lazy constructor without requiring a WebGL context/PMREM.
      const probe = Object.create(Atmosphere.prototype) as RainProbe;
      probe.scene = new Scene(); probe.quality = quality; probe.time = 48;
      probe.rain = null; probe.rainU = null;
      expect(probe.scene.children).toHaveLength(0);
      expect(probe.rain).toBeNull();
      probe.createRain();
      const rain = probe.rain!;
      expect(probe.scene.children).toEqual([rain]);
      expect((rain.geometry as BufferGeometry).getAttribute('aBase').count).toBe(strips * 2);
      expect((rain.geometry as BufferGeometry).getAttribute('aEnd').count).toBe(strips * 2);
      expect((probe as RainProbe).rainU?.uTime.value).toBe(48);
      probe.createRain();
      expect(probe.scene.children).toHaveLength(1);
      expect(probe.rain).toBe(rain);
      rain.geometry.dispose(); (rain.material as Material).dispose();
      rain.removeFromParent();
    },
  );
});
