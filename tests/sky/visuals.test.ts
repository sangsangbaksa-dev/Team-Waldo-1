import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { detailJet } from '../../src/sky/visuals';

describe('SKY WAR 항공기 장식 LOD', () => {
  it('세부 메시를 하나의 그룹으로 묶어 원거리에서 일괄 생략할 수 있다', () => {
    const jet = new THREE.Group();
    const detail = detailJet(jet, 'fighter', 'enemy');
    expect(jet.children).toContain(detail);
    expect(detail.name).toBe('jetDetail');
    expect(detail.children.length).toBeGreaterThan(20);
    expect(detail.getObjectByName('flameCore')).toBeDefined();
    detail.visible = false;
    expect(jet.visible).toBe(true);
    expect(detail.visible).toBe(false);
  });

  it.each(['fighter', 'ace', 'bomber', 'boss'] as const)('%s 장식은 이름과 부모 그룹이 일관된다', kind => {
    const jet = new THREE.Group();
    const group = detailJet(jet, kind, 'player');
    expect(group.parent).toBe(jet);
    expect(group.getObjectByName('flameCore')).toBeDefined();
    expect(group.children.length).toBeGreaterThan(20);
  });
});
