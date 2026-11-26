/** Domain: outfits, body proportions and animation curves. No clock, collision or rendering. */

export type Locale = 'forest' | 'city' | 'rich' | 'desert' | 'slum' | 'base';
export type Garment = 'leather' | 'suit' | 'hoodie' | 'fatigues' | 'uniform' | 'casual' | 'hiker' | 'linen';
export type HairStyle = 'crop' | 'side' | 'bun' | 'buzz' | 'long' | 'curl' | 'dread';
export type Headwear = 'none' | 'hood' | 'cap' | 'helmet' | 'brim' | 'beret' | 'hijab';
export type Role = 'player' | 'local' | 'officer' | 'soldier';
export type Clip = 'idle' | 'walk' | 'run' | 'jump' | 'punch' | 'enter' | 'talk' | 'phone';
export type YawMode = 'harbor' | 'drive';

export const ENTER_SECONDS = 1.05;
export const EXIT_SECONDS = 0.72;

export interface Wardrobe {
  garment: Garment;
  role: Role;
  height: number;
  shoulders: number;
  hips: number;
  skin: number;
  hair: number;
  eyes: number;
  hairStyle: HairStyle;
  headwear: Headwear;
  top: number;
  cloth: number;
  bottom: number;
  shoes: number;
  sole: number;
  metal: number;
  sleeves: 'long' | 'short';
  beard: boolean;
  bulk: number;
}

export interface Pose {
  crouch: number;
  hipsYaw: number;
  hipsRoll: number;
  spineX: number;
  spineY: number;
  spineZ: number;
  headX: number;
  headY: number;
  headZ: number;
  lShoulderX: number;
  lShoulderY: number;
  lShoulderZ: number;
  rShoulderX: number;
  rShoulderY: number;
  rShoulderZ: number;
  lElbow: number;
  rElbow: number;
  lHipX: number;
  rHipX: number;
  lHipZ: number;
  rHipZ: number;
  lKnee: number;
  rKnee: number;
  lAnkle: number;
  rAnkle: number;
  prop: 'none' | 'phone';
}

const POSE_KEYS = [
  'crouch', 'hipsYaw', 'hipsRoll', 'spineX', 'spineY', 'spineZ',
  'headX', 'headY', 'headZ',
  'lShoulderX', 'lShoulderY', 'lShoulderZ', 'rShoulderX', 'rShoulderY', 'rShoulderZ',
  'lElbow', 'rElbow',
  'lHipX', 'rHipX', 'lHipZ', 'rHipZ',
  'lKnee', 'rKnee', 'lAnkle', 'rAnkle',
] as const satisfies readonly (keyof Pose)[];

const SKIN = [0x3c2415, 0x5a3825, 0x6b4423, 0x8d5524, 0xa56b45, 0xc68642, 0xd1a37a, 0xe0ac69, 0xf1c27d, 0xffdbac, 0xf6d7b8] as const;
const HAIR = [0x14110e, 0x2a1a12, 0x4a2f1b, 0x6b4423, 0x8a5a2a, 0xc4a265, 0x2c241c, 0x6a6a6a, 0x1a120c] as const;
const EYES = [0x3a2a1c, 0x5a3a22, 0x2e4a32, 0x3d5a78, 0x1e1e1e, 0x6a4a28] as const;

export function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pick<T>(rand: () => number, list: readonly T[]): T {
  return list[Math.floor(rand() * list.length)]!;
}

function smooth(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

function stand(partial: Partial<Pose> = {}): Pose {
  return {
    crouch: 0, hipsYaw: 0, hipsRoll: 0,
    spineX: 0.04, spineY: 0, spineZ: 0,
    headX: 0, headY: 0, headZ: 0,
    lShoulderX: 0.1, lShoulderY: 0, lShoulderZ: -0.2,
    rShoulderX: 0.1, rShoulderY: 0, rShoulderZ: 0.2,
    lElbow: 0.32, rElbow: 0.32,
    lHipX: 0, rHipX: 0, lHipZ: -0.04, rHipZ: 0.04,
    lKnee: 0.08, rKnee: 0.08, lAnkle: 0, rAnkle: 0,
    prop: 'none',
    ...partial,
  };
}

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const out = stand();
  for (const key of POSE_KEYS) out[key] = a[key] + (b[key] - a[key]) * t;
  out.prop = t < 0.5 ? a.prop : b.prop;
  return out;
}

function sampleLoop(frames: readonly Pose[], phase: number): Pose {
  const p = ((phase % 1) + 1) % 1;
  const x = p * frames.length;
  const i = Math.floor(x) % frames.length;
  const f = x - Math.floor(x);
  const a = frames[i]!;
  const b = frames[(i + 1) % frames.length]!;
  return lerpPose(a, b, f < 1e-6 ? 0 : smooth(f));
}

function sampleTrack(keys: readonly { t: number; pose: Pose }[], phase: number): Pose {
  const p = Math.max(0, Math.min(0.9999, phase));
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1]!.t < p) i += 1;
  const a = keys[i]!;
  const b = keys[Math.min(i + 1, keys.length - 1)]!;
  const span = Math.max(1e-6, b.t - a.t);
  return lerpPose(a.pose, b.pose, a === b ? 0 : smooth((p - a.t) / span));
}

function contact(leftForward: boolean, run: boolean): Pose {
  const s = leftForward ? 1 : -1;
  const amp = run ? 1.35 : 1;
  return stand({
    lHipX: -0.78 * s * amp,
    rHipX: 0.64 * s * amp,
    lKnee: leftForward ? (run ? 0.34 : 0.22) : (run ? 1.35 : 1.15),
    rKnee: leftForward ? (run ? 1.28 : 1.08) : (run ? 0.3 : 0.2),
    lHipZ: leftForward ? -0.04 : -0.22,
    rHipZ: leftForward ? 0.22 : 0.04,
    lAnkle: leftForward ? -0.16 : 0.34,
    rAnkle: leftForward ? 0.3 : -0.12,
    lShoulderX: 0.95 * s * (run ? 1.2 : 1),
    rShoulderX: -0.9 * s * (run ? 1.2 : 1),
    lShoulderZ: leftForward ? -0.12 : -0.48,
    rShoulderZ: leftForward ? 0.48 : 0.12,
    lElbow: run ? 1.28 : 0.85,
    rElbow: run ? 1.32 : 0.9,
    spineY: -0.22 * s * (run ? 1.15 : 1),
    hipsYaw: -0.1 * s,
    hipsRoll: 0.07 * s,
    headY: 0.12 * s,
    headX: run ? -0.08 : 0.02,
    spineX: run ? 0.4 : 0.1,
  });
}

function passing(liftRight: boolean, run: boolean): Pose {
  return stand({
    lHipX: liftRight ? 0.16 : -0.28,
    rHipX: liftRight ? -0.32 : 0.14,
    lKnee: liftRight ? 0.24 : (run ? 1.4 : 1.2),
    rKnee: liftRight ? (run ? 1.45 : 1.22) : 0.22,
    lHipZ: liftRight ? -0.05 : -0.2,
    rHipZ: liftRight ? 0.2 : 0.05,
    lShoulderX: liftRight ? -0.28 : 0.36,
    rShoulderX: liftRight ? 0.34 : -0.26,
    lShoulderZ: liftRight ? -0.16 : -0.42,
    rShoulderZ: liftRight ? 0.42 : 0.16,
    lElbow: run ? 1.25 : 0.95,
    rElbow: run ? 1.3 : 1.0,
    spineX: run ? 0.38 : 0.08,
    headX: run ? -0.06 : 0,
  });
}

const WALK = [contact(true, false), passing(true, false), contact(false, false), passing(false, false)] as const;
const RUN = [contact(true, true), passing(true, true), contact(false, true), passing(false, true)] as const;
const IDLE = [
  stand({ spineX: 0.035, lShoulderX: 0.12, rShoulderX: 0.1 }),
  stand({ spineX: 0.085, hipsRoll: 0.04, headX: -0.03, lShoulderX: 0.16, rShoulderX: 0.06, spineY: 0.045, hipsYaw: 0.03 }),
] as const;

const JUMP = [
  { t: 0, pose: stand() },
  { t: 0.16, pose: stand({ crouch: 0.85, lKnee: 1.25, rKnee: 1.25, lHipX: 0.45, rHipX: 0.45, spineX: 0.35, headX: 0.2, lShoulderX: 0.7, rShoulderX: 0.7, lElbow: 0.7, rElbow: 0.7 }) },
  { t: 0.3, pose: stand({ lKnee: 0.7, rKnee: 0.7, lHipX: -0.4, rHipX: -0.4, spineX: -0.06, lShoulderX: -2.55, rShoulderX: -2.55, lShoulderZ: -0.42, rShoulderZ: 0.42, lElbow: 0.4, rElbow: 0.4, headX: -0.2 }) },
  { t: 0.55, pose: stand({ crouch: 0.25, lKnee: 0.95, rKnee: 0.95, lHipX: -0.45, rHipX: -0.45, lShoulderX: -1.7, rShoulderX: -1.7, lElbow: 0.45, rElbow: 0.45, spineX: 0.05 }) },
  { t: 0.82, pose: stand({ lKnee: 0.35, rKnee: 0.35, lShoulderX: -0.7, rShoulderX: -0.7, lElbow: 0.4, rElbow: 0.4, spineX: 0.12, lAnkle: -0.2, rAnkle: -0.2 }) },
  { t: 1, pose: stand({ crouch: 0.7, lKnee: 1.15, rKnee: 1.15, lHipX: 0.35, rHipX: 0.35, spineX: 0.32, headX: 0.12, lShoulderX: 0.35, rShoulderX: 0.35 }) },
] as const;

const PUNCH = [
  { t: 0, pose: stand({ lElbow: 1.05, rElbow: 1.05, lShoulderX: -0.4, rShoulderX: -0.35, lShoulderZ: -0.55, rShoulderZ: 0.85 }) },
  { t: 0.22, pose: stand({ rElbow: 1.75, rShoulderX: 0.9, rShoulderZ: 1.25, lElbow: 1.15, lShoulderX: -0.85, lShoulderZ: -0.45, spineY: -0.58, hipsYaw: -0.38, spineX: 0.1 }) },
  { t: 0.42, pose: stand({ rElbow: 0.1, rShoulderX: -0.25, rShoulderZ: -1.45, lElbow: 1.05, lShoulderX: 0.25, lShoulderZ: -0.5, spineY: 0.68, hipsYaw: 0.42, spineX: 0.12, headY: 0.2 }) },
  { t: 0.7, pose: stand({ rElbow: 0.45, rShoulderX: -0.35, rShoulderZ: -0.75, spineY: 0.3, hipsYaw: 0.16, lElbow: 0.85, lShoulderX: -0.2 }) },
  { t: 1, pose: stand({ lElbow: 0.7, rElbow: 0.7, lShoulderX: -0.3, rShoulderX: -0.3 }) },
] as const;

const ENTER = [
  { t: 0, pose: stand() },
  { t: 0.25, pose: stand({ rShoulderX: -1.15, rElbow: 0.45, spineY: 0.28, headY: 0.18, hipsYaw: 0.12 }) },
  { t: 0.5, pose: stand({ crouch: 0.8, lKnee: 1.15, rKnee: 0.85, lHipX: -0.55, rHipX: 0.25, spineX: 0.7, headX: 0.4, rShoulderX: -0.6, lShoulderX: 0.4 }) },
  { t: 0.75, pose: stand({ crouch: 1, lKnee: 1.4, rKnee: 1.05, lHipX: -1.2, rHipX: -0.4, spineX: 0.78, headX: 0.35, lShoulderX: -0.4, rShoulderX: -0.3 }) },
  { t: 1, pose: stand({ crouch: 0.9, lKnee: 1.5, rKnee: 1.5, lHipX: -1.05, rHipX: -1.05, spineX: 0.22, headX: 0.08, lShoulderX: -0.55, rShoulderX: -0.55, lElbow: 0.7, rElbow: 0.7 }) },
] as const;

const TALK_QUIET = stand({ rElbow: 0.5, lElbow: 0.42, headY: 0.14, hipsRoll: 0.03 });
const TALK_LOUD = stand({
  rShoulderX: -0.62, rElbow: 1.15, rShoulderZ: 0.28, rShoulderY: -0.12,
  lElbow: 0.55, lShoulderX: -0.15, spineY: 0.12, headY: 0.18, hipsRoll: 0.04, spineX: 0.05,
});

const PHONE_EAR = stand({
  rShoulderX: -0.7, rShoulderZ: 0.28, rShoulderY: -0.2, rElbow: 1.7,
  lElbow: 0.35, headZ: 0.18, headY: 0.12, headX: 0.06, hipsRoll: 0.04,
  prop: 'phone',
});
const PHONE_SCREEN = stand({
  rShoulderX: -0.42, rShoulderZ: 0.16, rElbow: 1.35,
  lShoulderX: -0.38, lShoulderZ: -0.14, lElbow: 1.2,
  headX: 0.52, headY: -0.08, spineX: 0.12,
  prop: 'phone',
});

export function playerLook(): Wardrobe {
  return {
    garment: 'leather', role: 'player', height: 1.84, shoulders: 0.46, hips: 0.33,
    skin: 0xc48a62, hair: 0x14110e, eyes: 0x3a2a1c, hairStyle: 'crop', headwear: 'none',
    top: 0x1a1e27, cloth: 0xe8e4dc, bottom: 0x2a3d5c, shoes: 0x161616, sole: 0xcfc8bc,
    metal: 0x8a7344, sleeves: 'long', beard: false, bulk: 1.02,
  };
}

function body(rand: () => number, role: Role): Pick<Wardrobe, 'height' | 'shoulders' | 'hips' | 'skin' | 'hair' | 'eyes' | 'hairStyle' | 'beard'> {
  const feminine = role === 'player' ? false : rand() < 0.46;
  return {
    height: (feminine ? 1.68 : 1.8) + (rand() - 0.5) * 0.06,
    shoulders: (feminine ? 0.38 : 0.46) + (rand() - 0.5) * 0.02,
    hips: (feminine ? 0.36 : 0.32) + (rand() - 0.5) * 0.015,
    skin: pick(rand, SKIN),
    hair: pick(rand, HAIR),
    eyes: pick(rand, EYES),
    hairStyle: feminine
      ? pick(rand, ['long', 'curl', 'bun', 'side', 'dread'] as const)
      : pick(rand, ['crop', 'side', 'curl', 'dread', 'buzz'] as const),
    beard: !feminine && rand() < 0.34,
  };
}

function suit(rand: () => number, role: Role): Wardrobe {
  const jackets = [0x1b2744, 0x2a2e36, 0x1a1c20, 0x243044] as const;
  const ties = [0x6e1c2c, 0x1e4d73, 0xb0893e, 0x1f3d34] as const;
  const top = pick(rand, jackets);
  return {
    ...body(rand, role), garment: 'suit', role, headwear: 'none',
    top, cloth: pick(rand, ties), bottom: top, shoes: 0x141414, sole: 0x2a2a2a,
    metal: 0xc0a15a, sleeves: 'long', bulk: 1,
  };
}

function hoodie(rand: () => number, role: Role): Wardrobe {
  const tops = [0x2c3138, 0x6d302c, 0x243528, 0x3d3428, 0x1e2a3a, 0x4a3048] as const;
  return {
    ...body(rand, role), garment: 'hoodie', role,
    headwear: rand() < 0.62 ? 'hood' : 'cap',
    top: pick(rand, tops), cloth: pick(rand, [0xd9d4cc, 0x1a1a1a, 0xc4553a] as const),
    bottom: pick(rand, [0x2a3a56, 0x33445f, 0x3d4d66, 0x2c3544] as const),
    shoes: 0x1c1c1c, sole: 0xf2f2ee, metal: 0x222222, sleeves: 'long', bulk: 1.16,
  };
}

function fatigues(rand: () => number, role: Role): Wardrobe {
  const top = pick(rand, [0x4a5234, 0x3d4630, 0x55603c] as const);
  return {
    ...body(rand, role), garment: 'fatigues', role,
    headwear: rand() < 0.72 ? 'helmet' : 'beret',
    hairStyle: 'buzz', beard: false,
    top, cloth: 0x2c3424, bottom: top, shoes: 0x2a241c, sole: 0x1a1612,
    metal: 0xc0b8a0, sleeves: 'long', bulk: 1.05,
  };
}

function uniform(rand: () => number, role: Role): Wardrobe {
  return {
    ...body(rand, role), garment: 'uniform', role, headwear: 'cap', beard: false,
    top: 0x1a3058, cloth: 0xd4b15a, bottom: 0x15243f, shoes: 0x141414, sole: 0x2a2a2a,
    metal: 0xe6c56a, sleeves: 'long', bulk: 1,
  };
}

function casual(rand: () => number, role: Role): Wardrobe {
  return {
    ...body(rand, role), garment: 'casual', role,
    headwear: rand() < 0.28 ? 'cap' : 'none',
    top: pick(rand, [0x2d5e8c, 0xc24b38, 0xe4dfd4, 0x2c6a4c, 0x24282e, 0x7a3e62] as const),
    cloth: pick(rand, [0xf4f1ea, 0x1c1c1c, 0xd8d2c8] as const),
    bottom: pick(rand, [0x2a3a56, 0x3a4a68, 0x243044, 0xc4b48a, 0x8d734c] as const),
    shoes: pick(rand, [0x1c1c1c, 0xf4f4f2, 0x8a3030] as const),
    sole: 0xe8e8e4, metal: 0x888888,
    sleeves: rand() < 0.45 ? 'short' : 'long', bulk: 1,
  };
}

function hiker(rand: () => number, role: Role): Wardrobe {
  return {
    ...body(rand, role), garment: 'hiker', role, headwear: 'cap',
    top: pick(rand, [0x6a3a28, 0x2c4634, 0x3d4a5c] as const),
    cloth: 0x4a4036, bottom: pick(rand, [0x2a3a56, 0x3d4a62] as const), shoes: 0x3a2a1c, sole: 0x2a2118,
    metal: 0x6a6258, sleeves: 'long', bulk: 1.02,
  };
}

function linen(rand: () => number, role: Role): Wardrobe {
  return {
    ...body(rand, role), garment: 'linen', role, headwear: 'brim',
    top: pick(rand, [0xe7d3a6, 0xd8c4a2, 0xf0e6d0] as const),
    cloth: 0xc2a36a, bottom: pick(rand, [0xb08a5e, 0x8d734c] as const),
    shoes: 0x6a4a32, sole: 0x3a2a1c, metal: 0x8a7048,
    sleeves: 'short', bulk: 1,
  };
}

function veil(wardrobe: Wardrobe, rand: () => number, locale: Locale, role: Role): Wardrobe {
  if (role !== 'local') return wardrobe;
  if (wardrobe.headwear === 'hood' || wardrobe.headwear === 'helmet') return wardrobe;
  const chance = locale === 'desert' ? 0.42 : locale === 'city' || locale === 'rich' ? 0.16 : locale === 'slum' ? 0.1 : 0.07;
  if (rand() >= chance) return wardrobe;
  return { ...wardrobe, headwear: 'hijab', hairStyle: 'buzz', beard: false };
}

export function wardrobeFor(locale: Locale, salt: number, role: Role = 'local'): Wardrobe {
  if (role === 'player') return playerLook();
  const rand = mulberry((salt >>> 0) ^ 0x51f2a1);
  const wardrobe = role === 'officer' ? uniform(rand, role)
    : role === 'soldier' || locale === 'base' ? fatigues(rand, 'soldier')
      : locale === 'rich' ? suit(rand, role)
        : locale === 'slum' ? hoodie(rand, role)
          : locale === 'forest' ? hiker(rand, role)
            : locale === 'desert' ? linen(rand, role)
              : casual(rand, role);
  return veil(wardrobe, rand, locale, role);
}

/** Harbor yaw 0 looks toward -Z. Drive yaw 0 looks toward +Z. The rig always faces +Z. */
export function modelYaw(yaw: number, mode: YawMode): number {
  return mode === 'harbor' ? Math.PI - yaw : yaw;
}

export function yawToward(dx: number, dz: number, mode: YawMode): number {
  if (Math.hypot(dx, dz) < 1e-5) return 0;
  return mode === 'harbor' ? Math.atan2(dx, -dz) : Math.atan2(dx, dz);
}

export function poseAt(clip: Clip, phase: number, emphasis = 0): Pose {
  let pose: Pose;
  switch (clip) {
    case 'walk':
      pose = sampleLoop(WALK, phase);
      if (emphasis > 0) {
        pose.lShoulderX *= 1 - 0.6 * emphasis;
        pose.rShoulderX *= 1 - 0.6 * emphasis;
        pose.spineY *= 1 - 0.7 * emphasis;
        pose.hipsYaw *= 1 - 0.5 * emphasis;
        pose.spineX = pose.spineX * (1 - emphasis) + 0.02 * emphasis;
        pose.lKnee += 0.12 * emphasis;
        pose.rKnee += 0.12 * emphasis;
      }
      break;
    case 'run':
      pose = sampleLoop(RUN, phase);
      break;
    case 'idle': {
      pose = sampleLoop(IDLE, phase);
      const breath = Math.sin((((phase % 1) + 1) % 1) * Math.PI * 2);
      pose.spineX += breath * 0.03;
      pose.headX += breath * -0.012;
      pose.lShoulderX += breath * 0.018;
      pose.rShoulderX += breath * 0.018;
      break;
    }
    case 'jump':
      pose = sampleTrack(JUMP, phase);
      break;
    case 'punch':
      pose = sampleTrack(PUNCH, phase);
      break;
    case 'enter':
      pose = sampleTrack(ENTER, phase);
      break;
    case 'talk': {
      const wave = 0.5 - 0.5 * Math.cos(((phase % 1) + 1) % 1 * Math.PI * 2);
      pose = lerpPose(TALK_QUIET, TALK_LOUD, Math.max(0, Math.min(1, emphasis)) * (0.35 + 0.65 * wave));
      pose.headX += Math.sin(((phase % 1) + 1) % 1 * Math.PI * 2) * 0.08 * (0.4 + emphasis);
      break;
    }
    case 'phone': {
      const ear = PHONE_EAR;
      const screen = PHONE_SCREEN;
      pose = lerpPose(ear, screen, Math.max(0, Math.min(1, emphasis)));
      pose.headX += Math.sin(((phase % 1) + 1) % 1 * Math.PI * 2) * (emphasis > 0.5 ? 0.04 : 0.02);
      pose.prop = 'phone';
      break;
    }
    default:
      pose = stand();
  }
  return pose;
}

const CROSSED = stand({
  lShoulderX: -0.35, rShoulderX: -0.35,
  lShoulderZ: 0.42, rShoulderZ: -0.42,
  lElbow: 1.35, rElbow: 1.45,
  spineX: 0.05, headX: 0.04,
});

const POCKET = stand({
  lShoulderX: 0.22, rShoulderX: 0.22,
  lShoulderZ: 0.32, rShoulderZ: -0.32,
  lElbow: 1.2, rElbow: 1.2,
  spineX: 0.04,
});

/** Idle with a breath, sometimes arms crossed or hands in pockets. */
export function idleStance(seed: number, phase: number): Pose {
  const breath = poseAt('idle', phase);
  const kind = Math.abs(seed) % 5;
  if (kind === 0) {
    const pose = lerpPose(breath, CROSSED, 0.92);
    pose.spineX = breath.spineX;
    pose.headX = breath.headX;
    return pose;
  }
  if (kind === 1 || kind === 2) {
    const pose = lerpPose(breath, POCKET, 0.9);
    pose.spineX = breath.spineX;
    return pose;
  }
  return breath;
}

export function listeningPose(phase: number): Pose {
  const breath = poseAt('idle', phase);
  const pose = lerpPose(breath, CROSSED, 0.94);
  pose.spineX = breath.spineX;
  pose.headY = breath.headY + 0.12;
  return pose;
}

export function seatedPose(): Pose {
  return stand({
    crouch: 0.35, lKnee: 1.55, rKnee: 1.55, lHipX: -1.05, rHipX: -1.05,
    lAnkle: -0.35, rAnkle: -0.35, spineX: 0.18, headX: 0.06,
    lShoulderX: -0.85, rShoulderX: -0.85, lElbow: 0.85, rElbow: 0.85,
    lShoulderZ: -0.25, rShoulderZ: 0.25,
  });
}
