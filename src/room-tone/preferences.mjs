/** A local ROOM TONE choice overrides the arcade-wide default. */
export function initialMute(local, global) {
  // The shared arcade setting takes precedence over a legacy ROOM TONE value.
  if (global && typeof global === "object" && typeof global.sound === "boolean")
    return !global.sound;
  return typeof local === "boolean" ? local : false;
}

/** Honor either the arcade-wide or operating-system motion preference. */
export function reduceRoomToneMotion(preferences, systemReduced) {
  return Boolean(systemReduced || (
    preferences && typeof preferences === "object" && preferences.reducedMotion === true
  ));
}
