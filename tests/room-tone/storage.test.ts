import { test } from "vitest";
import assert from "node:assert/strict";
import { createRoomStorage } from "../../src/room-tone/storage.mjs";

function memoryStorage(backing: Map<string, string>) {
  return {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => { backing.set(key, value); },
    removeItem: (key: string) => { backing.delete(key); },
  };
}

test("blocked storage retains independent session snapshots", () => {
  const store = createRoomStorage(() => { throw new Error("blocked"); });
  const progress = { found: [true, false, false] };
  assert.equal(store.write("save", progress), false);
  progress.found[0] = false;
  assert.deepEqual(store.read("save"), { found: [true, false, false] });
  assert.equal(store.remove("save"), false);
  assert.equal(store.read("save"), null);
});

test("successful writes persist and malformed records fail safely", () => {
  const backing = new Map<string, string>([["broken", "{"]]);
  const getStorage = () => memoryStorage(backing);
  const store = createRoomStorage(getStorage);
  assert.equal(store.read("broken"), null);
  assert.equal(store.write("save", { ch: 2 }), true);
  assert.deepEqual(createRoomStorage(getStorage).read("save"), { ch: 2 });
  assert.equal(store.remove("save"), true);
  assert.equal(createRoomStorage(getStorage).read("save"), null);
});

test("successful reads reflect changes made by other tabs", () => {
  const backing = new Map<string, string>();
  const store = createRoomStorage(() => memoryStorage(backing));
  assert.equal(store.write("save", { ch: 1 }), true);
  backing.set("save", JSON.stringify({ ch: 3 }));
  assert.deepEqual(store.read("save"), { ch: 3 });
  backing.delete("save");
  assert.equal(store.read("save"), null);
});

test("unpersisted writes and removals override stale storage values", () => {
  const backing = new Map<string, string>([["save", JSON.stringify({ ch: 1 })]]);
  let blocked = true;
  const store = createRoomStorage(() => ({
    ...memoryStorage(backing),
    setItem(key: string, value: string) {
      if (blocked) throw new Error("quota");
      backing.set(key, value);
    },
    removeItem(key: string) {
      if (blocked) throw new Error("blocked");
      backing.delete(key);
    },
  }));
  assert.equal(store.write("save", { ch: 2 }), false);
  assert.deepEqual(store.read("save"), { ch: 2 });
  blocked = false;
  assert.equal(store.write("save", { ch: 3 }), true);
  assert.deepEqual(store.read("save"), { ch: 3 });
  blocked = true;
  assert.equal(store.remove("save"), false);
  assert.equal(store.read("save"), null);
  blocked = false;
  assert.equal(store.remove("save"), true);
  assert.equal(backing.has("save"), false);
});

test("read failure uses the last known value without losing it", () => {
  const backing = new Map<string, string>([["controls", '{"sensitivity":1.5}']]);
  let readable = true;
  const store = createRoomStorage(() => ({
    ...memoryStorage(backing),
    getItem(key: string) {
      if (!readable) throw new Error("blocked");
      return backing.get(key) ?? null;
    },
  }));
  assert.deepEqual(store.read("controls"), { sensitivity: 1.5 });
  readable = false;
  assert.deepEqual(store.read("controls"), { sensitivity: 1.5 });
  assert.equal(store.write("unsupported", undefined), false);
  const circular: { self?: unknown } = {};
  circular.self = circular;
  assert.equal(store.write("circular", circular), false);
  assert.equal(store.read("circular"), null);
});
