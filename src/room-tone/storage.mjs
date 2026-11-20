// A session fallback preserves progress when browser storage is disabled or full.
export function createRoomStorage(getStorage) {
  const session = new Map();
  return {
    read(key) {
      try {
        const raw = session.has(key) ? session.get(key) : getStorage().getItem(key);
        return raw == null ? null : JSON.parse(raw);
      } catch { return null; }
    },
    write(key, value) {
      let raw;
      try { raw = JSON.stringify(value); } catch { return false; }
      if (typeof raw !== "string") return false;
      session.set(key, raw);
      try { getStorage().setItem(key, raw); return true; } catch { return false; }
    },
    remove(key) {
      session.set(key, null);
      try { getStorage().removeItem(key); return true; } catch { return false; }
    },
  };
}
