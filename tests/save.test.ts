import { describe, expect, it } from 'vitest';
import { buy, createWorld, openShop } from '../src/game/world';
import { clearSave, deserialize, loadGame, saveGame, SAVE_KEY, type KeyValueStore } from '../src/game/save';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('save / load', () => {
  it('round-trips a world, always loading with the shop closed and the apprentice idle', () => {
    const store = memoryStore();
    const w = createWorld(1);
    w.coins = 20;
    buy(w, 'page:repeat');
    openShop(w);
    w.apprentice.activity = 'brewing';
    w.apprentice.brewing = 'health potion';
    w.code = 'while True:\n    brew("health potion")\n    serve()\n';
    saveGame(store, w);

    const loaded = loadGame(store)!;
    expect(loaded.coins).toBe(10);
    expect(loaded.pages).toContain('repeat');
    expect(loaded.code).toBe(w.code);
    expect(loaded.open).toBe(false);
    expect(loaded.task).toBeNull();
    expect(loaded.apprentice.activity).toBe('idle');
    expect(loaded.apprentice.brewing).toBeUndefined();
  });

  it('starts fresh from the old prototype save, corrupt data, or a future version', () => {
    expect(deserialize(JSON.stringify({ version: 1, coins: 500 }))).toBeUndefined();
    expect(deserialize('not json')).toBeUndefined();
    expect(deserialize('{"version": 99}')).toBeUndefined();
  });

  it('fills in fields missing from a partial save', () => {
    const loaded = deserialize(JSON.stringify({ version: 2, coins: 7 }))!;
    expect(loaded.coins).toBe(7);
    expect(loaded.stats.runs).toBe(0);
    expect(loaded.pages).toEqual(['first']);
  });

  it('can clear a save', () => {
    const store = memoryStore();
    saveGame(store, createWorld(1));
    expect(store.data.has(SAVE_KEY)).toBe(true);
    clearSave(store);
    expect(loadGame(store)).toBeUndefined();
  });
});
