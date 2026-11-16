// OUTLAW CITY의 공용 도시 모델을 로드하고 캐릭터·차량 접근을 제공합니다.
import * as THREE from 'three';
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
    cache = loadModels(base, onProgress).then(models => {
      const required = (key: string, fallback: string): CharModel => models.chars[key] ?? models.chars[fallback]!;
      const civilians = ['civ', 'civ2', 'civ3', 'civ4', 'civ5', 'civ6', 'civ7', 'civ8'];
      const gangKinds = ['rifle', 'merc', 'guard'];
      const assets: OutlawAssets = {
        ...models,
        pedModel(kind, variant) {
          const n = Math.abs(Math.trunc(variant));
          if (kind === 'civ') {
            for (let i = 0; i < civilians.length; i++) {
              const candidate = civilians[(n + civilians.length - i) % civilians.length]!;
              if (models.chars[candidate]) return models.chars[candidate]!;
            }
            return required('civ', 'worker');
          }
          const key = kind === 'cop' ? 'cop' : kind === 'swat' ? 'swat' : kind === 'soldier' ? 'heavy' : kind === 'gang' ? gangKinds[n % gangKinds.length]! : kind === 'boss' ? 'boss' : 'worker';
          return required(key, kind === 'player' ? 'boss' : 'worker');
        },
        vehicleTemplate(kind) {
          const model = models.vehicles[kind];
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
