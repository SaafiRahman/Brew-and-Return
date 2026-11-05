/** Plain JSON data: the only thing that crosses the game ↔ code-runner boundary. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type PotionId = 'health potion' | 'mana potion';
export type Spot = 'cauldron' | 'counter';
export type PageId = 'first' | 'repeat' | 'choices';
export type ShopItemId = 'page:repeat' | 'page:choices' | 'recipe:mana' | 'cauldron';

export interface Customer {
  id: number;
  name: string;
  emoji: string;
  wants: PotionId;
  /** Seconds of patience left. Only counts down while this customer is at the counter. */
  patience: number;
  maxPatience: number;
  /** Game time this customer reached the counter (undefined while queued). */
  atCounterSince?: number;
  /** Halves with every wrong potion they turn away. */
  rewardMult: number;
  wrongTries: number;
}

export type Activity = 'idle' | 'walking' | 'brewing' | 'waiting' | 'serving' | 'reading' | 'talking' | 'shrugging';

export interface Apprentice {
  spot: Spot;
  holding: PotionId | null;
  activity: Activity;
  /** Potion in the cauldron while brewing. */
  brewing?: PotionId;
  /** Speech bubble text. */
  says?: string;
}

/** One small piece of an action, processed over game time. */
export type Step =
  | { kind: 'walk'; to: Spot; time: number }
  | { kind: 'brew'; potion: PotionId; time: number }
  | { kind: 'waitCustomer' }
  | { kind: 'handover'; time: number }
  | { kind: 'read'; time: number }
  | { kind: 'say'; text: string; time: number; activity: Activity; result: Json };

/** An action requested by the player's code (brew, serve, order…), in progress. */
export interface Task {
  action: string;
  steps: Step[];
  /** Time already spent on steps[0]. */
  elapsed: number;
  done: boolean;
  result: Json;
  /** Set when the action can't run at all; the runner raises it as an error in the player's code. */
  error?: string;
}

export interface LedgerEntry {
  id: number;
  time: number;
  text: string;
  tone: 'info' | 'reward' | 'warn' | 'sale';
  /** Expandable extra detail, e.g. a raw traceback. */
  detail?: string;
}

export interface World {
  version: 2;
  /** Game seconds. Only advances while the shop is open (a spell is running). */
  time: number;
  coins: number;
  lifetimeCoins: number;
  owned: ShopItemId[];
  cauldronLevel: number;
  pages: PageId[];
  apprentice: Apprentice;
  queue: Customer[];
  spawnTimer: number;
  nextId: number;
  rngState: number;
  stats: { served: number; rejected: number; leftUnhappy: number; runs: number };
  discoveries: string[];
  code: string;
  speed: number;
  ledger: LedgerEntry[];
  /** Transient: not saved. */
  open: boolean;
  task: Task | null;
}
