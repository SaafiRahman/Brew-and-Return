import { createWorld } from './world';
import type { World } from './types';

export const SAVE_KEY = 'brew-and-return/save';
export const CURRENT_VERSION = 2;

/** Minimal storage interface so saves can be tested without a browser. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Migrations from version N to N+1, keyed by N. Add one whenever World changes
 * shape, and bump CURRENT_VERSION. Version 1 was the old serve(order) prototype,
 * which can't be carried over, so it has no migration and starts fresh.
 */
const MIGRATIONS: Record<number, (old: any) => any> = {};

export function serialize(w: World): string {
  const { open: _open, task: _task, ...rest } = w;
  return JSON.stringify(rest);
}

export function deserialize(raw: string): World | undefined {
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!data || typeof data !== 'object' || typeof data.version !== 'number') return undefined;
  if (data.version > CURRENT_VERSION) return undefined;
  while (data.version < CURRENT_VERSION) {
    const migrate = MIGRATIONS[data.version];
    if (!migrate) return undefined;
    data = migrate(data);
  }
  const fresh = createWorld(data.rngState ?? 1);
  const w: World = { ...fresh, ...data, stats: { ...fresh.stats, ...data.stats }, open: false, task: null };
  // Anything mid-action when the game was saved is dropped: the spell isn't running any more.
  w.apprentice = { ...fresh.apprentice, ...data.apprentice, activity: 'idle', brewing: undefined, says: undefined };
  return w;
}

export function saveGame(store: KeyValueStore, w: World): void {
  try {
    store.setItem(SAVE_KEY, serialize(w));
  } catch {
    // Storage full or blocked: the game keeps running, just unsaved.
  }
}

export function loadGame(store: KeyValueStore): World | undefined {
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
