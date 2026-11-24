let enginePromise;
export function loadEngine() {
  if (!enginePromise) enginePromise = Promise.all([
    import("three"),
    import("three/addons/loaders/GLTFLoader.js"),
    import("../monster.js"),
  ]).then(([THREE, loader, monster]) => ({
    THREE, GLTFLoader: loader.GLTFLoader, createCaptureShot: monster.createCaptureShot, fixMonster: monster.fixMonster,
  })).catch(error => {
    enginePromise = null;
    throw error;
  });
  return enginePromise;
}
