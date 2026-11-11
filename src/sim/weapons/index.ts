import type { WeaponDef, WeaponLevel } from "../../data/schema";
import type { WeaponState, World } from "../types";
import { fireAura } from "./aura";
import { fireOrbit } from "./orbit";
import { fireProjectile } from "./projectile";
import { fireBeam, fireBoomerang, fireStorm } from "./advanced";

/** 무기 패턴 구현. 쐈으면 true, 쏠 대상이 없어 쿨다운을 돌리지 않으려면 false. */
export type WeaponPattern = (
  world: World,
  state: WeaponState,
  def: WeaponDef,
  lv: WeaponLevel,
) => boolean;

/** weapons.json의 pattern 값과 1:1. 새 패턴은 파일을 추가하고 여기와 schema.ts에 등록한다. */
export const WEAPON_PATTERNS: Record<WeaponDef["pattern"], WeaponPattern> = {
  projectile: fireProjectile,
  orbit: fireOrbit,
  aura: fireAura,
  beam: fireBeam,
  boomerang: fireBoomerang,
  storm: fireStorm,
};
