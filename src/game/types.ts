/** Plain JSON data — the only thing that crosses the game ↔ code-runner boundary. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** What a customer asks for. Fields appear as `order.<field>` in player code. */
export interface Order {
  potion?: string;
  symptom?: string;
  quantity?: number;
  [key: string]: Json | undefined;
}

export type KindId = 'first' | 'villager' | 'healer' | 'knight';
export type PageId = 'strings' | 'conditionals' | 'dictionaries' | 'loops';
export type UpgradeId = 'sign' | 'tipjar';

export interface Customer {
  id: number;
  kind: KindId;
  name: string;
  emoji: string;
  line: string;
  order: Order;
  expected: Json;
  /** First customer of a new type: failing is free and points to a Spellbook page. */
  teaser: boolean;
}

/** Result of calling the player's function. Produced by a CodeRunner. */
export type CallResult =
  | { kind: 'ok'; value: Json; stdout: string }
  | { kind: 'error'; errorType: string; message: string; line?: number; traceback: string; stdout: string }
  | { kind: 'timeout' };

export type Verdict = 'correct' | 'wrong' | 'error' | 'timeout';

export interface Receipt {
  id: number;
  tick: number;
  customer: Pick<Customer, 'name' | 'emoji' | 'kind' | 'line' | 'order' | 'expected' | 'teaser'>;
  verdict: Verdict;
  got?: Json;
  hint?: string;
  traceback?: string;
  stdout?: string;
  coins: number;
  tip: number;
  repDelta: number;
  practice: boolean;
  /** Page the player should look at to solve this customer. */
  suggestPage?: PageId;
  /** Page granted for free because the player solved a teaser on their own. */
  freePage?: PageId;
}

export type LedgerEntry =
  | { type: 'receipt'; receipt: Receipt }
  | { type: 'message'; id: number; tick: number; text: string; tone: 'info' | 'reward' | 'warn' };

export interface GameState {
  version: 1;
  coins: number;
  lifetimeCoins: number;
  reputation: number;
  tick: number;
  open: boolean;
  speed: number;
  /** Index into STAGES. */
  stage: number;
  /** Correct serves of the current stage's customer type since the stage began. */
  stageCorrect: number;
  teaserSpawned: boolean;
  pages: PageId[];
  availablePages: PageId[];
  upgrades: Record<UpgradeId, number>;
  discoveries: string[];
  queue: Customer[];
  spawnTimer: number;
  nextId: number;
  failStreak: number;
  stats: { served: number; correct: number; wrong: number };
  code: string;
  rngState: number;
  ledger: LedgerEntry[];
}
