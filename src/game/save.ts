import { createGame } from './engine';
import type { GameState } from './types';

export const SAVE_KEY = 'brew-and-return/save';
export const CURRENT_VERSION = 1;

/** Minimal storage interface so saves can be tested without a browser. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Migrations from version N to N+1, keyed by N. Add one whenever GameState
 * changes shape, and bump CURRENT_VERSION.
 */
const MIGRATIONS: Record<number, (old: any) => any> = {};

export function serialize(s: GameState): string {
  // The shop always starts closed after loading: the player reopens it.
  return JSON.stringify({ ...s, open: false });
}

export function deserialize(raw: string): GameState | undefined {
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!data || typeof data !== 'object' || typeof data.version !== 'number') return undefined;
  if (data.version > CURRENT_VERSION) return undefined; // save from a newer build
  while (data.version < CURRENT_VERSION) {
    const migrate = MIGRATIONS[data.version];
    if (!migrate) return undefined;
    data = migrate(data);
  }
  // Fill in any fields missing from older or hand-edited saves.
  const fresh = createGame(data.rngState ?? 1);
  return { ...fresh, ...data, upgrades: { ...fresh.upgrades, ...data.upgrades }, stats: { ...fresh.stats, ...data.stats }, open: false };
}

export function saveGame(store: KeyValueStore, s: GameState): void {
  try {
    store.setItem(SAVE_KEY, serialize(s));
  } catch {
    // Storage full or blocked: the game keeps running, just unsaved.
  }
}

export function loadGame(store: KeyValueStore): GameState | undefined {
  try {
    const raw = store.getItem(SAVE_KEY);
    return raw ? deserialize(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function clearSave(store: KeyValueStore): void {
  try {
    store.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
