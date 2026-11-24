import { normalizeCampaign } from "../campaign.mjs";
export const SAVE = "waldo.rt03.campaign.v1";
export const LAST = "waldo.rt03.complete.v1";
export const PREFS = "waldo.preferences.v1";
export function createCampaignStore(storage) {
  const read = key => { try { return storage.read(key); } catch { return null; } };
  const write = (key, value) => { try { storage.write(key, value); } catch { /* Storage is optional. */ } };
  return {
    read,
    saved: () => normalizeCampaign(read(SAVE)),
    save: ({ ch, found, solved, seen, elapsed }) => write(SAVE, { v: 1, ch, found, solved, seen: [...seen], elapsed }),
    complete(elapsed) {
      try { storage.write(LAST, { elapsed }); storage.remove(SAVE); } catch { /* Storage is optional. */ }
    },
    writeMute(muted) {
      try {
        const stored = read(PREFS);
        const prefs = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
        storage.write(PREFS, { ...prefs, sound: !muted });
        storage.write("rt-silent", muted);
      } catch { /* Storage is optional. */ }
    },
    write,
  };
}
