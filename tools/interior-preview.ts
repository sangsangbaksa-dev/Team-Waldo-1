// 사업체 내부 미리보기 (개발 전용): vite dev 서버에서 /tools/interior-preview.html?kind=store&x=..&y=..&yaw=..&pitch=.. 로 엽니다.
import * as THREE from 'three';
import { INTERIORS } from '../src/city/interior';
import { Interior3D } from '../src/city/interior3d';
import { loadModels } from '../src/city/models';
import type { BizKind } from '../src/city/defs';

const q = new URLSearchParams(location.search), kind = (q.get('kind') ?? 'store') as BizKind, lay = INTERIORS[kind];
const num = (k: string, d: number): number => (q.has(k) ? Number(q.get(k)) : d);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(1); document.body.append(renderer.domElement);
const w = window as unknown as Record<string, unknown>;
loadModels('/').then(models => {
  const ins = new Interior3D(lay, 'high', models);
  const draw = (x: number, y: number, yaw: number, pitch: number, t = 3): void => { ins.update(t, x, y, yaw, pitch, 0, innerWidth / innerHeight); renderer.render(ins.scene, ins.camera); };
  w.__draw = draw; w.__info = (): unknown => { let meshes = 0, lights = 0; ins.scene.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes++; if ((o as THREE.Light).isLight) lights++; }); return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, meshes, lights }; }; draw(num('x', lay.spawn.x), num('y', lay.spawn.y), num('yaw', lay.spawn.ang), num('pitch', 0), num('t', 3)); w.__ready = true;
}).catch(e => { w.__err = String((e as Error)?.stack ?? e); });
