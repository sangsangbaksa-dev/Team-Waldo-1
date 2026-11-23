export function createRoomStorage(getStorage) {
  const snapshot = new Map();
  const pending = new Set();

  function decode(raw) {
    if (raw == null) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  return {
    read(key) {
      if (pending.has(key)) return decode(snapshot.get(key));
      try {
        const raw = getStorage().getItem(key);
        snapshot.set(key, raw);
        return decode(raw);
      } catch {
        return decode(snapshot.get(key));
      }
    },
    write(key, value) {
      let raw;
      try { raw = JSON.stringify(value); } catch { return false; }
      if (typeof raw !== "string") return false;

      snapshot.set(key, raw);
      try {
        getStorage().setItem(key, raw);
        pending.delete(key);
        return true;
      } catch {
        pending.add(key);
        return false;
      }
    },
    remove(key) {
      snapshot.set(key, null);
      try {
        getStorage().removeItem(key);
        pending.delete(key);
        return true;
      } catch {
        pending.add(key);
        return false;
      }
    },
  };
}
