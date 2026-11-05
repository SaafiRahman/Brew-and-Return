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
    w.apprentice.brewing = 'health';
    w.code = 'while True:\n    brew(Potion.health)\n    serve()\n';
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

  it('upgrades v2 saves from potion strings to Potion objects, including the spell', () => {
    const v2 = {
      version: 2,
      coins: 12,
      code: 'while True:\n    if order() == "mana potion":\n        brew("mana potion")\n    else:\n        brew(\'health potion\')\n    serve()\n',
      queue: [{ id: 1, name: 'Pip', emoji: '🧑', wants: 'mana potion', patience: 30, maxPatience: 30, rewardMult: 1, wrongTries: 0 }],
      apprentice: { spot: 'counter', holding: 'health potion', activity: 'idle' },
    };
    const w = deserialize(JSON.stringify(v2))!;
    expect(w.version).toBe(3);
    expect(w.coins).toBe(12);
    expect(w.queue[0].wants).toBe('mana');
    expect(w.apprentice.holding).toBe('health');
    expect(w.code).toBe('while True:\n    if order() == Potion.mana:\n        brew(Potion.mana)\n    else:\n        brew(Potion.health)\n    serve()\n');
  });

  it('starts fresh from the old prototype save, corrupt data, or a future version', () => {
    expect(deserialize(JSON.stringify({ version: 1, coins: 500 }))).toBeUndefined();
    expect(deserialize('not json')).toBeUndefined();
    expect(deserialize('{"version": 99}')).toBeUndefined();
  });

  it('fills in fields missing from a partial save', () => {
    const loaded = deserialize(JSON.stringify({ version: 3, coins: 7 }))!;
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
