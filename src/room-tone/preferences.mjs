/** A local ROOM TONE choice overrides the arcade-wide default. */
export function initialMute(local, global) {
  if (typeof local === "boolean") return local;
  return Boolean(global && typeof global === "object" && global.sound === false);
}
