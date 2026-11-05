import { describe, expect, it } from 'vitest';
import { buyUpgrade, createGame, serveFront } from '../src/game/engine';
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
  it('round-trips a game, always reopening closed', () => {
    const store = memoryStore();
    const s = createGame(1);
    serveFront(s, { kind: 'ok', value: 'health potion', stdout: '' });
    s.coins = 50;
    buyUpgrade(s, 'sign');
    s.open = true;
    s.code = 'def serve(order):\n    return order.potion\n';
    saveGame(store, s);

    const loaded = loadGame(store)!;
    expect(loaded.coins).toBe(35);
    expect(loaded.upgrades.sign).toBe(1);
    expect(loaded.code).toBe(s.code);
    expect(loaded.stage).toBe(1);
    expect(loaded.open).toBe(false);
  });

  it('ignores corrupt or future saves', () => {
    expect(deserialize('not json')).toBeUndefined();
    expect(deserialize('{"version": 99}')).toBeUndefined();
    expect(deserialize('null')).toBeUndefined();
  });

  it('fills in fields missing from older saves', () => {
    const loaded = deserialize(JSON.stringify({ version: 1, coins: 7, upgrades: {} }))!;
    expect(loaded.coins).toBe(7);
    expect(loaded.upgrades).toEqual({ sign: 0, tipjar: 0 });
    expect(loaded.pages).toEqual(['strings']);
  });

  it('can clear a save', () => {
    const store = memoryStore();
    saveGame(store, createGame(1));
    expect(store.data.has(SAVE_KEY)).toBe(true);
    clearSave(store);
    expect(loadGame(store)).toBeUndefined();
  });
});
