import { DISCOVERIES, KINDS, PAGES, SIGN_FACTOR, STARTER_CODE, UPGRADES } from './content';
import { judge } from './judge';
import { currentStage, customerMix, makeOrder, STAGES } from './progression';
import { nextRandom, pick, randInt } from './rng';
import type { CallResult, Customer, GameState, KindId, LedgerEntry, PageId, Receipt, UpgradeId } from './types';

/** One game tick is 100 ms of game time at 1× speed. */
export const TICK_MS = 100;
export const BASE_SPAWN_TICKS = 50;
export const SERVE_TICKS = 12;
export const MAX_QUEUE = 4;
export const LEDGER_CAP = 80;
export const REP_MIN = 10;
export const REP_MAX = 100;
export const FAIL_STREAK_PAUSE = 3;

export function createGame(seed = Date.now()): GameState {
  const s: GameState = {
    version: 1,
    coins: 0,
    lifetimeCoins: 0,
    reputation: 50,
    tick: 0,
    open: false,
    speed: 1,
    stage: 0,
    stageCorrect: 0,
    teaserSpawned: true,
    pages: ['strings'],
    availablePages: ['strings'],
    upgrades: { sign: 0, tipjar: 0 },
    discoveries: [],
    queue: [],
    spawnTimer: BASE_SPAWN_TICKS,
    nextId: 1,
    failStreak: 0,
    stats: { served: 0, correct: 0, wrong: 0 },
    code: STARTER_CODE,
    rngState: seed | 0,
    ledger: [],
  };
  s.queue.push(newCustomer(s, 'first'));
  message(s, 'Welcome to your potion shop! Old Maggie is waiting. Fill in the blank and press Open Shop.', 'info');
  return s;
}

// ---------------------------------------------------------------------------
// Time & customers
// ---------------------------------------------------------------------------

export function spawnInterval(s: GameState): number {
  const repFactor = 1.25 - s.reputation / 200; // rep 50 → 1.0, rep 100 → 0.75
  return Math.max(8, Math.round(BASE_SPAWN_TICKS * SIGN_FACTOR ** s.upgrades.sign * repFactor));
}

/** Advance game time while the shop is open. Spawns customers into the queue. */
export function advanceTime(s: GameState, ticks: number): void {
  if (!s.open) return;
  s.tick += ticks;
  s.spawnTimer -= ticks;
  // An empty shop fills quickly so the player never waits long.
  if (s.queue.length === 0) s.spawnTimer = Math.min(s.spawnTimer, 10);
  while (s.spawnTimer <= 0) {
    if (s.queue.length < MAX_QUEUE) spawnCustomer(s);
    s.spawnTimer += spawnInterval(s);
  }
}

export function spawnCustomer(s: GameState): Customer {
  const stage = currentStage(s);
  let c: Customer;
  if (!s.teaserSpawned && stage.teaser) {
    const { kind, made } = stage.teaser(s);
    c = newCustomer(s, kind, made, true);
    s.teaserSpawned = true;
    if (stage.intro) message(s, stage.intro, 'info');
  } else {
    c = newCustomer(s, pickKind(s));
  }
  s.queue.push(c);
  return c;
}

function pickKind(s: GameState): KindId {
  const mix = customerMix(s);
  const total = mix.reduce((n, m) => n + m.weight, 0);
  let r = nextRandom(s) * total;
  for (const m of mix) {
    r -= m.weight;
    if (r < 0) return m.kind;
  }
  return mix[mix.length - 1].kind;
}

function newCustomer(s: GameState, kind: KindId, made = makeOrder(s, kind), teaser = false): Customer {
  const def = KINDS[kind];
  return {
    id: s.nextId++,
    kind,
    name: pick(s, def.names),
    emoji: pick(s, def.emojis),
    line: made.line,
    order: made.order,
    expected: made.expected,
    teaser,
  };
}

/** A sample customer for penalty-free practice. Doesn't disturb the real game's randomness. */
export function practiceCustomer(s: GameState): Customer {
  const scratch = { ...s, rngState: (s.rngState ^ 0x5bd1e995) + s.nextId * 7919 };
  const front = s.queue[0];
  if (front) {
    // Practise on the same kind of order as the customer at the counter.
    return { ...newCustomer(scratch, front.kind), order: front.order, expected: front.expected, line: front.line, id: -1 };
  }
  const mix = customerMix(s);
  return { ...newCustomer(scratch, mix[mix.length - 1].kind), id: -1 };
}

// ---------------------------------------------------------------------------
// Serving
// ---------------------------------------------------------------------------

/** Payment before tips. Knights pay per potion. */
export function basePay(c: Pick<Customer, 'kind' | 'order'>): number {
  const per = KINDS[c.kind].pay;
  return c.kind === 'knight' ? per * (c.order.quantity ?? 1) : per;
}

export function rollTip(s: GameState): number {
  const lvl = s.upgrades.tipjar;
  const chance = 0.25 + 0.15 * lvl;
  if (nextRandom(s) >= chance) return 0;
  return randInt(s, 1, 1 + lvl);
}

/** Resolve the customer at the front of the queue with the result of the player's code. */
export function serveFront(s: GameState, result: CallResult): Receipt | undefined {
  const c = s.queue.shift();
  if (!c) return undefined;
  const j = judge(c, result);
  const stage = currentStage(s);
  const receipt: Receipt = {
    id: s.nextId++,
    tick: s.tick,
    customer: { name: c.name, emoji: c.emoji, kind: c.kind, line: c.line, order: c.order, expected: c.expected, teaser: c.teaser },
    verdict: j.verdict,
    got: j.got,
    hint: j.hint,
    traceback: j.traceback,
    stdout: j.stdout,
    coins: 0,
    tip: 0,
    repDelta: 0,
    practice: false,
  };
  s.stats.served++;

  if (j.verdict === 'correct') {
    s.stats.correct++;
    s.failStreak = 0;
    receipt.coins = basePay(c);
    receipt.tip = rollTip(s);
    receipt.repDelta = Math.min(2, REP_MAX - s.reputation);
    earn(s, receipt.coins + receipt.tip);
    s.reputation += receipt.repDelta;

    if (c.teaser && stage.page && !s.pages.includes(stage.page)) {
      // Solved a new customer before buying the page: they already know it!
      s.pages.push(stage.page);
      addAvailable(s, stage.page);
      receipt.freePage = stage.page;
    }
    if (c.kind === stage.focus) {
      s.stageCorrect++;
    }
  } else {
    s.stats.wrong++;
    if (c.teaser) {
      // New customer types are a free lesson, not a penalty.
      if (stage.page) {
        addAvailable(s, stage.page);
        if (!s.pages.includes(stage.page)) receipt.suggestPage = stage.page;
      }
      s.open = false;
    } else {
      s.failStreak++;
      if (j.verdict === 'timeout') s.open = false; // don't keep waking a sleeping apprentice
      receipt.repDelta = -Math.min(3, s.reputation - REP_MIN);
      s.reputation += receipt.repDelta;
      if (s.failStreak >= FAIL_STREAK_PAUSE) {
        s.open = false;
        s.failStreak = 0;
      }
    }
  }

  log(s, { type: 'receipt', receipt });

  if (receipt.freePage) {
    message(s, `You figured that out on your own! The "${PAGES[receipt.freePage].title}" page was added to your Spellbook for free.`, 'reward');
  }
  if (!s.open && j.verdict !== 'correct') {
    message(s, c.teaser
      ? 'A new kind of customer! The shop paused so you can read the receipt and update your spell.'
      : j.verdict === 'timeout'
        ? 'The shop closed while your apprentice naps. Fix the loop and press Open Shop.'
        : 'Your apprentice is muddled, so the shop closed for a moment. Fix the spell and press Open Shop.', 'warn');
  }
  checkAdvance(s);
  return receipt;
}

/** Judge a practice customer. Changes nothing except the ledger. */
export function practiceReceipt(s: GameState, c: Customer, result: CallResult): Receipt {
  const j = judge(c, result);
  const receipt: Receipt = {
    id: s.nextId++,
    tick: s.tick,
    customer: { name: c.name, emoji: c.emoji, kind: c.kind, line: c.line, order: c.order, expected: c.expected, teaser: false },
    verdict: j.verdict,
    got: j.got,
    hint: j.hint,
    traceback: j.traceback,
    stdout: j.stdout,
    coins: 0,
    tip: 0,
    repDelta: 0,
    practice: true,
  };
  log(s, { type: 'receipt', receipt });
  return receipt;
}

function checkAdvance(s: GameState): void {
  const stage = currentStage(s);
  if (s.stage >= STAGES.length - 1) return;
  const pageOk = !stage.page || s.pages.includes(stage.page);
  if (pageOk && s.stageCorrect >= stage.advanceAfter) {
    s.stage++;
    s.stageCorrect = 0;
    s.teaserSpawned = !STAGES[s.stage].teaser;
    // Make the next customer arrive promptly.
    s.spawnTimer = Math.min(s.spawnTimer, 15);
    if (s.stage === STAGES.length - 1) {
      message(s, "That's every customer in town for now. More are on the way in the next update! 🌙", 'info');
    }
  }
}

// ---------------------------------------------------------------------------
// Shopping
// ---------------------------------------------------------------------------

export function canBuyPage(s: GameState, id: PageId): boolean {
  return s.availablePages.includes(id) && !s.pages.includes(id) && s.coins >= PAGES[id].cost;
}

export function buyPage(s: GameState, id: PageId): boolean {
  if (!canBuyPage(s, id)) return false;
  s.coins -= PAGES[id].cost;
  s.pages.push(id);
  message(s, `New Spellbook page: ${PAGES[id].title}! New customers will start visiting.`, 'reward');
  checkAdvance(s);
  return true;
}

export function upgradeCost(s: GameState, id: UpgradeId): number | undefined {
  return UPGRADES[id].costs[s.upgrades[id]];
}

export function buyUpgrade(s: GameState, id: UpgradeId): boolean {
  const cost = upgradeCost(s, id);
  if (cost === undefined || s.coins < cost) return false;
  s.coins -= cost;
  s.upgrades[id]++;
  message(s, `${UPGRADES[id].emoji} ${UPGRADES[id].title} upgraded! ${UPGRADES[id].describe(s.upgrades[id])}`, 'reward');
  return true;
}

/** Reward concepts the player used for the first time. Returns the newly discovered features. */
export function applyDiscoveries(s: GameState, features: string[]): string[] {
  const found = features.filter((f) => DISCOVERIES[f] && !s.discoveries.includes(f));
  for (const f of found) {
    s.discoveries.push(f);
    earn(s, DISCOVERIES[f].bonus);
    message(s, `✨ You discovered ${DISCOVERIES[f].label}! +${DISCOVERIES[f].bonus} coins`, 'reward');
  }
  return found;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function earn(s: GameState, coins: number): void {
  s.coins += coins;
  s.lifetimeCoins += coins;
}

function addAvailable(s: GameState, page: PageId): void {
  if (!s.availablePages.includes(page)) s.availablePages.push(page);
}

export function message(s: GameState, text: string, tone: 'info' | 'reward' | 'warn' = 'info', detail?: string): void {
  log(s, { type: 'message', id: s.nextId++, tick: s.tick, text, tone, detail });
}

function log(s: GameState, entry: LedgerEntry): void {
  s.ledger.push(entry);
  if (s.ledger.length > LEDGER_CAP) s.ledger.splice(0, s.ledger.length - LEDGER_CAP);
}
