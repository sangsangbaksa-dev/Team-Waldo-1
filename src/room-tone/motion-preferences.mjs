/** Respect either an OS accessibility request or the arcade-wide toggle. */
export function reducedMotionOn(osReduced, savedPreferences) {
  return Boolean(osReduced) || savedPreferences?.reducedMotion === true;
}
