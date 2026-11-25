export function isFreshGameKey(event) {
  return !event.repeat && !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey;
}

export function canSaveOnInterruption(hasLevel, state) {
  return hasLevel && !["home", "won", "load", "error"].includes(state);
}

export function resolveHubUrl(baseUrl) {
  return new URL("../", baseUrl).href;
}
