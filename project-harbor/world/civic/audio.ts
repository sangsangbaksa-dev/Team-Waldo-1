import type { District } from '../domain';
import { districtAt, roadDistance } from '../domain';
import type { RegionProfile } from './regions';
import { PROFILES } from './regions';

export type EarKind = 'step' | 'gun' | 'impact' | 'horn' | 'scream' | 'shout' | 'phone' | 'ui' | 'cash';
export type Surface = 'asphalt' | 'concrete' | 'grass' | 'sand' | 'dirt' | 'gravel';
export type AudioBus = 'ambient' | 'vehicles' | 'weapons' | 'voices' | 'footsteps' | 'ui';

export interface AudioSettings {
  master: number;
  ambient: number;
  vehicles: number;
  weapons: number;
  voices: number;
  footsteps: number;
  ui: number;
  muted: boolean;
}

export const DEFAULT_AUDIO: AudioSettings = {
  master: 0.85, ambient: 0.65, vehicles: 0.75, weapons: 0.65, voices: 0.85, footsteps: 0.7, ui: 0.6, muted: false,
};

export interface Ear {
  kind: EarKind;
  x: number;
  z: number;
  gain: number;
  pitch: number;
  surface?: Surface;
}

export interface Bed {
  x: number;
  z: number;
  urgent?: boolean;
  rate?: number;
}

export interface Listen {
  x: number;
  z: number;
  yaw: number;
  hours: number;
}

export interface Voice {
  kind: EarKind;
  gain: number;
  pan: number;
  pitch: number;
  cutoff: number;
  surface?: Surface;
}

export interface MixFrame {
  ambient: { id: District; gain: number; color: RegionProfile['ambient'] }[];
  siren: { gain: number; yelp: boolean; pan: number };
  engines: { gain: number; pitch: number; pan: number }[];
  voices: Voice[];
  hours: number;
  district: District;
}

const REACH: Record<EarKind, number> = {
  step: 20, gun: 90, impact: 50, horn: 70, scream: 48, shout: 28, phone: 22, ui: 1, cash: 1,
};

const IMPORTANCE: Record<EarKind, number> = {
  gun: 1, ui: 1, impact: 0.9, scream: 0.78, horn: 0.72, cash: 0.55, shout: 0.6, phone: 0.58, step: 0.4,
};

const BUS: Record<EarKind, AudioBus> = {
  step: 'footsteps', gun: 'weapons', impact: 'vehicles', horn: 'vehicles',
  scream: 'voices', shout: 'voices', phone: 'voices', ui: 'ui', cash: 'ui',
};

export function perceived(value: number): number {
  const v = Math.max(0, Math.min(1, value));
  return v * v;
}

export function clampSettings(input: Partial<AudioSettings>): AudioSettings {
  const num = (value: number | undefined, fallback: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value as number)) : fallback;
  return {
    master: num(input.master, DEFAULT_AUDIO.master),
    ambient: num(input.ambient, DEFAULT_AUDIO.ambient),
    vehicles: num(input.vehicles, DEFAULT_AUDIO.vehicles),
    weapons: num(input.weapons, DEFAULT_AUDIO.weapons),
    voices: num(input.voices, DEFAULT_AUDIO.voices),
    footsteps: num(input.footsteps, DEFAULT_AUDIO.footsteps),
    ui: num(input.ui, DEFAULT_AUDIO.ui),
    muted: input.muted === true,
  };
}

export function surfaceAt(x: number, z: number): Surface {
  if (roadDistance(x, z) < 1.2) return 'asphalt';
  const id = districtAt(x, z).id;
  if (id === 'forest') return 'grass';
  if (id === 'desert') return 'sand';
  if (id === 'base') return 'gravel';
  if (id === 'city') return 'concrete';
  return 'dirt';
}

export function spatial(listen: Listen, x: number, z: number, maxDistance: number): { gain: number; pan: number; cutoff: number } {
  const dx = x - listen.x;
  const dz = z - listen.z;
  const dist = Math.hypot(dx, dz);
  if (dist >= maxDistance) return { gain: 0, pan: 0, cutoff: 500 };
  const gain = (1 / (1 + dist / 8)) * (1 - dist / maxDistance);
  const right = dx * Math.cos(listen.yaw) + dz * Math.sin(listen.yaw);
  const pan = Math.max(-1, Math.min(1, right / Math.max(2.5, dist)));
  const cutoff = dist < 10 ? 9000 : Math.max(650, 9000 - dist * 55);
  return { gain, pan, cutoff };
}

function busGain(settings: AudioSettings, bus: AudioBus): number {
  if (settings.muted) return 0;
  return perceived(settings.master) * perceived(settings[bus]);
}

export interface Mixer {
  district: District;
  from: District;
  fade: number;
  heard: Map<string, number>;
}

export function createMixer(district: District = 'city'): Mixer {
  return { district, from: district, fade: 1, heard: new Map() };
}

export interface MixInput {
  ears: readonly Ear[];
  listen: Listen;
  district: District;
  siren: Bed | null;
  engines: readonly Bed[];
}

/** Turns gameplay ears into a frame the Web Audio adapter can play. Hearing AI does not use this. */
export function renderMix(mixer: Mixer, input: MixInput, settings: AudioSettings, dt: number): MixFrame {
  if (input.district !== mixer.district) {
    mixer.from = mixer.district;
    mixer.district = input.district;
    mixer.fade = 0;
  }
  mixer.fade = Math.min(1, mixer.fade + dt / 2.2);
  const now = (mixer.heard.get('__t') ?? 0) + dt;
  mixer.heard.set('__t', now);
  const ranked: { voice: Voice; score: number }[] = [];
  for (const ear of input.ears) {
    const key = ear.kind + ':' + Math.round(ear.x) + ':' + Math.round(ear.z);
    const last = mixer.heard.get(key) ?? -10;
    const gap = ear.kind === 'gun' ? 0.045 : ear.kind === 'step' ? 0.05 : 0.12;
    if (now - last < gap) continue;
    mixer.heard.set(key, now);
    const local = ear.kind === 'ui' || ear.kind === 'cash';
    const placed = local ? { gain: 1, pan: 0, cutoff: 9000 } : spatial(input.listen, ear.x, ear.z, REACH[ear.kind]);
    if (placed.gain <= 0.02) continue;
    const gain = placed.gain * ear.gain * busGain(settings, BUS[ear.kind]);
    if (gain <= 0.001) continue;
    const voice: Voice = { kind: ear.kind, gain, pan: placed.pan, pitch: ear.pitch, cutoff: placed.cutoff, surface: ear.surface };
    ranked.push({ voice, score: 0.55 * IMPORTANCE[ear.kind] + 0.3 * placed.gain + 0.15 });
  }
  ranked.sort((a, b) => b.score - a.score);
  const kept = ranked.slice(0, 8).map(entry => entry.voice);
  const ambientBus = busGain(settings, 'ambient');
  const vehicleBus = busGain(settings, 'vehicles');
  const here = PROFILES[mixer.district];
  const there = PROFILES[mixer.from];
  const ambient = mixer.fade >= 0.999 || here.id === there.id
    ? [{ id: here.id, gain: ambientBus * 0.55, color: here.ambient }]
    : [
      { id: there.id, gain: ambientBus * 0.55 * (1 - mixer.fade), color: there.ambient },
      { id: here.id, gain: ambientBus * 0.55 * mixer.fade, color: here.ambient },
    ];
  let siren = { gain: 0, yelp: false, pan: 0 };
  if (input.siren) {
    const placed = spatial(input.listen, input.siren.x, input.siren.z, 140);
    siren = { gain: placed.gain * vehicleBus * 0.8, yelp: input.siren.urgent === true, pan: placed.pan };
  }
  const engines = input.engines.slice(0, 2).map(engine => {
    const placed = spatial(input.listen, engine.x, engine.z, 80);
    return { gain: placed.gain * vehicleBus * 0.7, pitch: engine.rate ?? 1, pan: placed.pan };
  }).filter(engine => engine.gain > 0.01);
  if (mixer.heard.size > 80) {
    for (const key of mixer.heard.keys()) if (key !== '__t' && now - (mixer.heard.get(key) ?? 0) > 2) mixer.heard.delete(key);
  }
  return { ambient, siren, engines, voices: kept, hours: input.listen.hours, district: here.id };
}
