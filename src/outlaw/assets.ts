// OUTLAW CITY의 공용 도시 모델을 로드하고 캐릭터·차량 접근을 제공합니다.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadModels, type CharModel, type Models } from '../city/models';
import type { PedKind, VehicleKind } from './types';

export interface OutlawAssets extends Models {
  pedModel(kind: PedKind, variant: number): CharModel;
  vehicleTemplate(kind: VehicleKind): THREE.Object3D;
}

let cache: Promise<OutlawAssets | null> | null = null;

export function loadOutlawAssets(
  base: string,
  onProgress?: (fraction: number, note: string) => void,
  onNote?: (note: string) => void,
): Promise<OutlawAssets | null> {
  if (!cache) {
    cache = loadModels(base, onProgress).then(async models => {
      // 레이싱카 모델(race.glb)을 차량 목록에 합칩니다. 못 받아도 기존 차량으로 대체합니다.
      const raceCars: Record<string, THREE.Object3D> = {};
      try { const gltf = await new GLTFLoader().loadAsync(`${base}assets/models/race.glb`); gltf.scene.traverse(o => { if (o.name === 'gt' || o.name === 'wide' || o.name === 'long') raceCars[o.name] = o; }); } catch { /* 선택 사항 */ }
      return { models, raceCars };
    }).then(({ models, raceCars }) => {
      const required = (key: string, fallback: string): CharModel => models.chars[key] ?? models.chars[fallback]!;
      const civilians = ['civ', 'civ2', 'civ3', 'civ4', 'civ5', 'civ6', 'civ7', 'civ8'];
      const gangKinds = ['rifle', 'merc', 'guard'];
      const assets: OutlawAssets = {
        ...models,
        pedModel(kind, variant) {
          const n = Math.abs(Math.trunc(variant));
          if (kind === 'civ' || kind === 'player') {
            for (let i = 0; i < civilians.length; i++) {
              const candidate = civilians[(n + civilians.length - i) % civilians.length]!;
              if (models.chars[candidate]) return models.chars[candidate]!;
            }
            return required('civ', 'worker');
          }
          const key = kind === 'cop' ? 'cop' : kind === 'swat' ? 'swat' : kind === 'soldier' ? 'heavy' : kind === 'gang' ? gangKinds[n % gangKinds.length]! : kind === 'boss' ? 'boss' : 'worker';
          return required(key, 'worker');
        },
        vehicleTemplate(kind) {
          const alias: Record<string, string> = { gt: 'gt', muscle: 'long', hyper: 'wide', ambulance: 'van' };
          const model = raceCars[alias[kind] ?? ''] ?? models.vehicles[alias[kind] && !raceCars[alias[kind]!] ? (kind === 'ambulance' ? 'van' : 'sports') : kind];
          if (!model) throw new Error(`Missing vehicle model: ${kind}`);
          return model;
        },
      };
      onProgress?.(1, '');
      return assets;
    }).catch(error => {
      onNote?.(error instanceof Error ? error.message : '모델을 불러오지 못했습니다.');
      cache = null;
      return null;
    });
  }
  return cache;
}
