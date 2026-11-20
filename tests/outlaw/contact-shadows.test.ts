import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ContactShadows, contactShadowTexture, shadowScale } from '../../src/outlaw/contact-shadows';
describe('batched vehicle contact shadows', () => {
  it('puts finite footprints into the shared instanced mesh with a fixed maximum count', () => {
    const s = new ContactShadows(2); s.begin(0);
    const f = { x: 2, y: .1, z: 3, yaw: 0, length: 4, width: 2 };
    expect(s.add(f)).toBe(true); expect(s.add({...f, x: 4})).toBe(true); expect(s.add(f)).toBe(false); s.end(); expect(s.mesh.count).toBe(2);
    const m = new THREE.Matrix4(); s.mesh.getMatrixAt(0,m); const p = new THREE.Vector3().setFromMatrixPosition(m); expect(p.x).toBe(2); expect(p.z).toBe(3);
    s.begin(1); expect(s.add({...f,gap: 3})).toBe(false); expect(s.add({...f,x:NaN})).toBe(false); s.end(); expect(s.mesh.visible).toBe(false); s.dispose(); s.dispose();
  });
  it('fades the texture to the outside and expands slightly for an airborne vehicle', () => {
    const t = contactShadowTexture(32), data = t.image.data;
    expect(data[3]).toBeLessThan(2); expect(data[(16 * 32 + 16) * 4 + 3]).toBeGreaterThan(240);
    expect(shadowScale(1)).toBeGreaterThan(shadowScale(0)); expect(shadowScale(100)).toBe(shadowScale(2)); t.dispose();
  });
});
