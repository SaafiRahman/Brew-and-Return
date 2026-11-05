import { signal } from '@preact/signals';
import { explainError, STUCK_HINT } from '../game/hints';
import { clearSave, loadGame, saveGame } from '../game/save';
import type { Json, PageId, ShopItemId, World } from '../game/types';
import { advance, afterRun, applyDiscoveries, beginAction, buy, closeShop, createWorld, log, openShop } from '../game/world';
import type { ActionReply, CodeRunner } from '../runner/CodeRunner';
import { PythonRunner } from '../runner/PythonRunner';

const TICK_MS = 50;
const AUTOSAVE_MS = 5000;
/** Python running this long without calling a command is stuck in a loop. */
const STUCK_MS = 3000;

const storage: Storage | undefined = (() => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
})();

/**
 * Glue between the pure game world, the code runner and the UI.
 * The world is mutated in place; `rev` is bumped so components re-render.
 */
export class Controller {
  world: World;
  readonly rev = signal(0);
  readonly runnerStatus = signal('Warming up the cauldron…');
  readonly runnerReady = signal(false);
  readonly running = signal(false);
  /** Line of the spell being carried out (for the editor highlight). */
  readonly currentLine = signal<number | null>(null);
  readonly spellbookOpen = signal<PageId | null>(null);

  private runner: CodeRunner;
  private pending?: { resolve(r: ActionReply): void };
  /** When Python last got control back (to spot loops that never call a command). */
  private pythonSince = 0;
  private stuck = false;

  constructor() {
    this.world = (storage && loadGame(storage)) || createWorld();
    this.runner = new PythonRunner({ onStatus: (t) => (this.runnerStatus.value = t) });
  }

  async start() {
    setInterval(() => this.tick(), TICK_MS);
    setInterval(() => this.save(), AUTOSAVE_MS);
    window.addEventListener('beforeunload', () => this.save());
    document.addEventListener('visibilitychange', () => document.hidden && this.save());
    try {
      await this.runner.init();
      this.runnerReady.value = true;
    } catch (err) {
      console.error(err);
      this.runnerStatus.value = globalThis.crossOriginIsolated
        ? "The cauldron wouldn't light. Check your internet connection and reload the page."
        : 'Your browser blocked the magic this shop needs. Try reloading, or use a recent Chrome, Edge or Firefox.';
    }
  }

  bump() {
    this.rev.value++;
  }

  save() {
    if (storage) saveGame(storage, this.world);
  }

  // -------------------------------------------------------------------------
  // Game clock
  // -------------------------------------------------------------------------

  private tick() {
    const w = this.world;
    if (!w.open) return;
    advance(w, (TICK_MS / 1000) * w.speed);
    if (this.pending && w.task?.done) {
      const { resolve } = this.pending;
      this.pending = undefined;
      const result = w.task.result;
      w.task = null;
      this.pythonSince = performance.now();
      resolve({ value: result });
    }
    if (!this.pending && this.running.value && !this.stuck && performance.now() - this.pythonSince > STUCK_MS) {
      this.stuck = true;
      this.runner.stop();
    }
    this.bump();
  }

  /** Carry out a command from the spell. Resolves once the apprentice has finished it. */
  private perform(action: string, args: Json[], line: number): Promise<ActionReply> {
    const w = this.world;
    this.currentLine.value = line || null;
    const task = beginAction(w, action, args);
    if (task.error) return Promise.resolve({ error: task.error });
    return new Promise((resolve) => (this.pending = { resolve }));
  }

  // -------------------------------------------------------------------------
  // Player actions
  // -------------------------------------------------------------------------

  setCode(code: string) {
    this.world.code = code;
  }

  async run() {
    if (!this.runnerReady.value || this.running.value) return;
    const w = this.world;
    this.running.value = true;
    this.stuck = false;
    this.pythonSince = performance.now();
    openShop(w);
    this.bump();
    const outcome = await this.runner.run(w.code, {
      loaded: (features) => applyDiscoveries(w, features),
      perform: (a, args, line) => this.perform(a, args, line),
    });
    this.pending = undefined;
    closeShop(w);
    this.running.value = false;
    this.currentLine.value = null;

    if (outcome.kind === 'error') {
      log(w, `📜 ${explainError(outcome)}`, 'warn', outcome.traceback || undefined);
    } else if (outcome.kind === 'stopped' && this.stuck) {
      log(w, STUCK_HINT, 'warn');
    } else if (outcome.kind === 'finished' && w.stats.runs <= 3) {
      log(w, 'Your spell finished. Press Run to cast it again.', 'info');
    }
    afterRun(w);
    this.save();
    this.bump();
  }

  stop() {
    this.runner.stop();
  }

  setSpeed(speed: number) {
    this.world.speed = speed;
    this.bump();
  }

  buy(id: ShopItemId) {
    if (buy(this.world, id)) {
      this.save();
      this.bump();
    }
  }

  reset() {
    this.runner.stop();
    if (storage) clearSave(storage);
    this.world = createWorld();
    this.bump();
  }
}

/**
 * Subscribe a component to world changes and return the world.
 * Components that read signals only re-render when their own signals change,
 * so every component that reads `ctl.world` must call this.
 */
export function useWorld(ctl: Controller): World {
  void ctl.rev.value;
  return ctl.world;
}
