/** Plain JSON data: the only thing that crosses the game ↔ code-runner boundary. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type PotionId = 'health' | 'mana' | 'cooling' | 'sleep';
export type Spot = 'cauldron' | 'counter';
export type PageId = 'first' | 'repeat' | 'choices' | 'remedies' | 'recipes' | 'loops';
export type ShopItemId =
  | 'page:repeat'
  | 'recipe:mana'
  | 'page:choices'
  | 'recipe:healer'
  | 'page:remedies'
  | 'almanac'
  | 'page:recipes'
  | 'contract:knight'
  | 'page:loops'
  | 'cauldron'
  | 'tipjar';

/**
 * Villagers want a health potion, wizards a mana potion. Healers name their
 * patient's ailment instead of a potion. Knights order several potions at once.
 */
export type CustomerKind = 'villager' | 'wizard' | 'healer' | 'knight';

export interface Customer {
  id: number;
  kind: CustomerKind;
  name: string;
  emoji: string;
  /** The potions that will satisfy them (several for knights, in any order). */
  wants: PotionId[];
  /** Healers only: the ailment `order()` reports, e.g. "fever". */
  ailment?: string;
  /** Seconds of patience left. Only counts down while this customer is at the counter. */
  patience: number;
  maxPatience: number;
  /** Game time this customer reached the counter (undefined while queued). */
  atCounterSince?: number;
  /** Halves with every wrong delivery they turn away. */
  rewardMult: number;
  wrongTries: number;
  /** Already got a hint about a muddled brew() for this customer (so the ledger isn't flooded). */
  hinted?: boolean;
}

export type Activity = 'idle' | 'walking' | 'brewing' | 'waiting' | 'serving' | 'reading' | 'talking' | 'shrugging';

export interface Apprentice {
  spot: Spot;
  /** Potions in hand (or in the basket, which holds more once knights visit). */
  holding: PotionId[];
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

/** What happened at the counter: shown as a little receipt in the ledger. */
export interface Receipt {
  customer: string;
  /** What `order()` gives for them, as code: `Potion.mana`, `"fever"`, `[Potion.health, Potion.mana]`. */
  asked: string;
  gave: string;
  /** What would have satisfied them, as code. */
  expected: string;
  ok: boolean;
  paid: number;
  tip: number;
}

export interface LedgerEntry {
  id: number;
  time: number;
  text: string;
  tone: 'info' | 'reward' | 'warn' | 'sale';
  /** Expandable extra detail, e.g. a raw traceback. */
  detail?: string;
  receipt?: Receipt;
}

export interface World {
  version: 4;
  /** Game seconds. Only advances while the shop is open (a spell is running). */
  time: number;
  coins: number;
  lifetimeCoins: number;
  owned: ShopItemId[];
  cauldronLevel: number;
  tipJarLevel: number;
  pages: PageId[];
  apprentice: Apprentice;
  queue: Customer[];
  spawnTimer: number;
  nextId: number;
  rngState: number;
  stats: { served: number; rejected: number; leftUnhappy: number; runs: number; knightsServed: number };
  discoveries: string[];
  /** One-time story beats already shown. */
  flags: string[];
  code: string;
  speed: number;
  ledger: LedgerEntry[];
  /** Transient: not saved. */
  open: boolean;
  task: Task | null;
}
