/** Resume transient game audio only while its owning session is visible and focused. */
export function shouldResumeSessionAudio(state, documentHidden, hasFocus) {
  return (state === "puzzle" || state === "capture") &&
    documentHidden === false && hasFocus === true;
}
