import { signal } from '@preact/signals';
import {
  advanceTime,
  applyDiscoveries,
  buyPage,
  buyUpgrade,
  createGame,
  message,
  practiceCustomer,
  practiceReceipt,
  SERVE_TICKS,
  serveFront,
  TICK_MS,
} from '../game/engine';
import { explainError } from '../game/hints';
import { clearSave, loadGame, saveGame } from '../game/save';
import type { GameState, Json, PageId, Receipt, UpgradeId, Verdict } from '../game/types';
import type { CodeRunner } from '../runner/CodeRunner';
import { PythonRunner } from '../runner/PythonRunner';

const AUTOSAVE_MS = 5000;

const storage: Storage | undefined = (() => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
})();

/** What the shop scene is animating at the counter. */
export interface CounterState {
  customerId: number;
  phase: 'brewing' | 'reacting';
  verdict?: Verdict;
  earned?: number;
}

/**
 * Glue between the pure game core, the code runner and the UI.
 * Game state is mutated in place; `rev` is bumped so components re-render.
 */
export class Controller {
  game: GameState;
  readonly rev = signal(0);
  readonly runnerStatus = signal('Warming up the cauldron…');
  readonly runnerReady = signal(false);
  readonly counter = signal<CounterState | null>(null);
  readonly busy = signal(false);
  /** The code currently loaded into the runner (to show "unsaved changes"). */
  readonly liveCode = signal<string | null>(null);
  readonly spellbookOpen = signal<PageId | null>(null);

  private runner: CodeRunner;
  private serving = false;
  private cooldown = 0;

  constructor() {
    this.game = (storage && loadGame(storage)) || createGame();
    this.runner = new PythonRunner({
      onStatus: (text) => (this.runnerStatus.value = text),
    });
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
      this.runnerStatus.value = "The cauldron wouldn't light. Check your internet connection and reload the page.";
      console.error(err);
    }
  }

  bump() {
    this.rev.value++;
  }

  save() {
    if (storage) saveGame(storage, this.game);
  }

  // -------------------------------------------------------------------------
  // Game clock
  // -------------------------------------------------------------------------

  private tick() {
    const s = this.game;
    if (!s.open || this.serving) return;
    const ticks = s.speed;
    const before = s.queue.length;
    advanceTime(s, ticks);
    this.cooldown -= ticks;
    if (this.cooldown <= 0 && s.queue.length && this.runnerReady.value) {
      void this.serveNext();
    } else if (s.queue.length !== before) {
      this.bump();
    }
  }

  private async serveNext() {
    const s = this.game;
    const customer = s.queue[0];
    this.serving = true;
    this.counter.value = { customerId: customer.id, phase: 'brewing' };
    this.bump();
    const [result] = await Promise.all([
      this.runner.call('serve', customer.order as Json),
      wait((SERVE_TICKS * TICK_MS * 0.5) / s.speed),
    ]);
    const receipt = serveFront(s, result);
    this.counter.value = {
      customerId: customer.id,
      phase: 'reacting',
      verdict: receipt?.verdict,
      earned: receipt ? receipt.coins + receipt.tip : 0,
    };
    this.bump();
    await wait((SERVE_TICKS * TICK_MS * 0.5) / s.speed);
    if (this.counter.value?.customerId === customer.id) this.counter.value = null;
    this.cooldown = 2;
    this.serving = false;
    this.bump();
  }

  // -------------------------------------------------------------------------
  // Player actions
  // -------------------------------------------------------------------------

  setCode(code: string) {
    this.game.code = code;
  }

  /** Load the editor's spell into the runner. Returns false (and explains) if it can't load. */
  private async loadSpell(): Promise<boolean> {
    const s = this.game;
    const res = await this.runner.setCode(s.code);
    if (!res.ok) {
      if (res.timeout) {
        message(s, '💤 Your spell got stuck in a loop before any customer arrived. Check loops outside `serve`.', 'warn');
      } else {
        message(s, `📜 ${explainError(res)}`, 'warn', res.traceback || undefined);
      }
      this.bump();
      return false;
    }
    this.liveCode.value = s.code;
    applyDiscoveries(s, res.features);
    if (res.stdout) message(s, `Your apprentice muttered: ${res.stdout}`, 'info');
    return true;
  }

  async openShop() {
    if (!this.runnerReady.value || this.busy.value) return;
    this.busy.value = true;
    try {
      if (await this.loadSpell()) {
        this.game.open = true;
        this.game.failStreak = 0;
        this.cooldown = 0;
      }
    } finally {
      this.busy.value = false;
      this.bump();
    }
  }

  closeShop() {
    this.game.open = false;
    this.bump();
  }

  async practice(): Promise<Receipt | undefined> {
    if (!this.runnerReady.value || this.busy.value) return;
    this.busy.value = true;
    try {
      if (!(await this.loadSpell())) return;
      const c = practiceCustomer(this.game);
      const result = await this.runner.call('serve', c.order as Json);
      return practiceReceipt(this.game, c, result);
    } finally {
      this.busy.value = false;
      this.bump();
    }
  }

  setSpeed(speed: number) {
    this.game.speed = speed;
    this.bump();
  }

  buyPage(id: PageId) {
    if (buyPage(this.game, id)) {
      this.save();
      this.bump();
    }
  }

  buyUpgrade(id: UpgradeId) {
    if (buyUpgrade(this.game, id)) {
      this.save();
      this.bump();
    }
  }

  reset() {
    if (storage) clearSave(storage);
    this.game = createGame();
    this.liveCode.value = null;
    this.counter.value = null;
    this.serving = false;
    this.bump();
  }
}

/**
 * Subscribe a component to game-state changes and return the state.
 * Components that read signals only re-render when their own signals change,
 * so every component that reads `ctl.game` must call this.
 */
export function useGame(ctl: Controller): GameState {
  void ctl.rev.value;
  return ctl.game;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
