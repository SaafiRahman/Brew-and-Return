import {
  BREW_TIME,
  CAULDRON_FACTOR,
  CUSTOMER_EMOJIS,
  CUSTOMER_NAMES,
  DISCOVERIES,
  FIRST_SPAWN,
  HANDOVER_TIME,
  knownPotions,
  MANA_SHARE,
  MAX_QUEUE,
  PATIENCE,
  POTIONS,
  QUICK_TIP_WINDOW,
  READ_TIME,
  SAY_TIME,
  SHOP,
  SHRUG_TIME,
  SPAWN_INTERVAL,
  STARTER_CODE,
  WALK_TIME,
} from './content';
import { nextRandom, pick } from './rng';
import type { Customer, Json, LedgerEntry, PotionId, ShopItemId, Step, Task, World } from './types';

export const LEDGER_CAP = 80;

export function createWorld(seed = Date.now()): World {
  const w: World = {
    version: 2,
    time: 0,
    coins: 0,
    lifetimeCoins: 0,
    owned: [],
    cauldronLevel: 0,
    pages: ['first'],
    apprentice: { spot: 'cauldron', holding: null, activity: 'idle' },
    queue: [],
    spawnTimer: FIRST_SPAWN,
    nextId: 1,
    rngState: seed | 0,
    stats: { served: 0, rejected: 0, leftUnhappy: 0, runs: 0 },
    discoveries: [],
    code: STARTER_CODE,
    speed: 1,
    ledger: [],
    open: false,
    task: null,
  };
  // The very first customer is already waiting and wants the simplest thing.
  addCustomer(w, 'health potion');
  log(w, 'Welcome to your potion shop! A customer is waiting. Press Run to cast your first spell.', 'info');
  return w;
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** Advance game time. Nothing happens while the shop is closed (no spell running). */
export function advance(w: World, dt: number): void {
  if (!w.open || dt <= 0) return;
  w.time += dt;
  tickCustomers(w, dt);
  if (w.task && !w.task.done) runTask(w, w.task, dt);
}

function tickCustomers(w: World, dt: number) {
  w.spawnTimer -= dt;
  while (w.spawnTimer <= 0) {
    if (w.queue.length < MAX_QUEUE) addCustomer(w);
    w.spawnTimer += SPAWN_INTERVAL;
  }
  const front = w.queue[0];
  if (front) {
    front.atCounterSince ??= w.time;
    front.patience -= dt;
    if (front.patience <= 0) {
      w.queue.shift();
      w.stats.leftUnhappy++;
      log(w, `${front.emoji} ${front.name} got tired of waiting and left without their ${front.wants}.`, 'warn');
      if (w.queue[0]) w.queue[0].atCounterSince = w.time;
    }
  }
}

export function addCustomer(w: World, wants?: PotionId): Customer {
  const known = knownPotions(w);
  const choice: PotionId =
    wants ?? (known.includes('mana potion') && nextRandom(w) < MANA_SHARE ? 'mana potion' : 'health potion');
  const c: Customer = {
    id: w.nextId++,
    name: pick(w, CUSTOMER_NAMES),
    emoji: pick(w, CUSTOMER_EMOJIS),
    wants: choice,
    patience: PATIENCE,
    maxPatience: PATIENCE,
    rewardMult: 1,
    wrongTries: 0,
  };
  if (w.queue.length === 0) c.atCounterSince = w.time;
  w.queue.push(c);
  return c;
}

// ---------------------------------------------------------------------------
// Actions requested by the player's code
// ---------------------------------------------------------------------------

export const ACTIONS = ['brew', 'serve', 'order', 'say'] as const;

export function brewTime(w: World): number {
  return BREW_TIME * CAULDRON_FACTOR ** w.cauldronLevel;
}

/** Start an action. Invalid requests come back already done with an `error`. */
export function beginAction(w: World, action: string, args: Json[]): Task {
  const task: Task = { action, steps: [], elapsed: 0, done: false, result: null };
  const fail = (error: string) => ({ ...task, done: true, error });
  const a = w.apprentice;
  const walkTo = (to: 'cauldron' | 'counter') => (a.spot === to ? [] : [{ kind: 'walk', to, time: WALK_TIME } as Step]);

  switch (action) {
    case 'brew': {
      if (args.length !== 1 || typeof args[0] !== 'string') {
        return fail('brew needs the name of a potion in quotes, like brew("health potion").');
      }
      const name = args[0].trim().toLowerCase().replace(/\s+/g, ' ');
      const known = knownPotions(w);
      if (!(name in POTIONS)) {
        return fail(`Your apprentice doesn't know a potion called "${args[0]}". Recipes you know: ${known.map((p) => `"${p}"`).join(', ')}.`);
      }
      const potion = name as PotionId;
      if (!known.includes(potion)) {
        return fail(`You haven't learned the ${potion} recipe yet. Buy it in the shop!`);
      }
      if (a.holding) {
        task.steps = [{ kind: 'say', text: 'My hands are full!', time: SHRUG_TIME, activity: 'shrugging', result: false }];
      } else {
        task.steps = [...walkTo('cauldron'), { kind: 'brew', potion, time: brewTime(w) }];
      }
      break;
    }
    case 'serve': {
      if (args.length) return fail("serve() doesn't need anything in its brackets. It hands over whatever you're holding.");
      if (!a.holding) {
        task.steps = [{ kind: 'say', text: "I'm not holding a potion!", time: SHRUG_TIME, activity: 'shrugging', result: false }];
      } else {
        task.steps = [...walkTo('counter'), { kind: 'waitCustomer' }, { kind: 'handover', time: HANDOVER_TIME }];
      }
      break;
    }
    case 'order': {
      if (args.length) return fail("order() doesn't need anything in its brackets. It tells you what the customer wants.");
      task.steps = [...walkTo('counter'), { kind: 'waitCustomer' }, { kind: 'read', time: READ_TIME }];
      break;
    }
    case 'say': {
      const text = args.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ').slice(0, 120);
      log(w, `🧙 “${text}”`, 'info');
      task.steps = [{ kind: 'say', text, time: SAY_TIME, activity: 'talking', result: null }];
      break;
    }
    default:
      return fail(`Your apprentice doesn't know how to ${action}.`);
  }
  w.task = task;
  return task;
}

function runTask(w: World, task: Task, dt: number) {
  const a = w.apprentice;
  let budget = dt;
  while (!task.done) {
    const step = task.steps[0];
    if (!step) {
      task.done = true;
      a.activity = 'idle';
      a.says = undefined;
      break;
    }
    // Entering a step.
    if (task.elapsed === 0) enterStep(w, step);

    if (step.kind === 'waitCustomer') {
      if (w.queue.length) {
        task.steps.shift();
        task.elapsed = 0;
        continue;
      }
      a.activity = 'waiting';
      break; // wait for customers to arrive (tickCustomers)
    }

    const need = step.time - task.elapsed;
    if (budget < need) {
      task.elapsed += budget;
      break;
    }
    budget -= need;
    task.steps.shift();
    task.elapsed = 0;
    finishStep(w, task, step);
  }
}

function enterStep(w: World, step: Step) {
  const a = w.apprentice;
  a.says = undefined;
  switch (step.kind) {
    case 'walk':
      a.activity = 'walking';
      a.spot = step.to;
      break;
    case 'brew':
      a.activity = 'brewing';
      a.brewing = step.potion;
      break;
    case 'handover':
      a.activity = 'serving';
      break;
    case 'read':
      a.activity = 'reading';
      break;
    case 'say':
      a.activity = step.activity;
      a.says = step.text;
      break;
  }
}

function finishStep(w: World, task: Task, step: Step) {
  const a = w.apprentice;
  switch (step.kind) {
    case 'brew':
      a.holding = step.potion;
      a.brewing = undefined;
      break;
    case 'say':
      task.result = step.result;
      break;
    case 'read': {
      const c = w.queue[0];
      if (!c) {
        // They left while we were reading. Wait for the next one.
        task.steps.unshift({ kind: 'waitCustomer' }, step);
        return;
      }
      task.result = c.wants;
      break;
    }
    case 'handover': {
      const c = w.queue[0];
      if (!c || !a.holding) {
        task.steps.unshift({ kind: 'waitCustomer' }, step);
        return;
      }
      task.result = handOver(w, c, a.holding);
      a.holding = null;
      break;
    }
  }
}

/** Give a potion to the customer at the counter. Returns whether they accepted it. */
function handOver(w: World, c: Customer, potion: PotionId): boolean {
  if (potion === c.wants) {
    w.queue.shift();
    const base = POTIONS[potion].price;
    const pay = Math.max(1, Math.round(base * c.rewardMult));
    const quick = c.wrongTries === 0 && c.atCounterSince !== undefined && w.time - c.atCounterSince <= QUICK_TIP_WINDOW;
    const tip = quick ? 1 : 0;
    earn(w, pay + tip);
    w.stats.served++;
    const extra = c.wrongTries ? ` (less after ${c.wrongTries} wrong ${c.wrongTries === 1 ? 'try' : 'tries'})` : '';
    log(w, `${c.emoji} ${c.name} bought a ${potion}. +${pay}${tip ? ' +1 tip' : ''} 🪙${extra}`, 'sale');
    if (w.queue[0]) w.queue[0].atCounterSince = w.time;
    return true;
  }
  c.wrongTries++;
  c.rewardMult /= 2;
  w.stats.rejected++;
  const hint = w.owned.includes('page:choices') || w.discoveries.includes('if')
    ? 'Check what they want with `order()` before brewing.'
    : 'Not every customer wants the same thing. The Spellbook page "Choices" teaches your apprentice to read orders.';
  if (c.wrongTries === 1) {
    log(w, `${c.emoji} ${c.name} wanted a ${c.wants}, not a ${potion}. They'll pay less now. ${hint}`, 'warn');
  } else {
    log(w, `${c.emoji} ${c.name} turned away another ${potion}. They still want a ${c.wants}.`, 'warn');
  }
  return false;
}

// ---------------------------------------------------------------------------
// Running spells
// ---------------------------------------------------------------------------

/** Called when a spell starts running. */
export function openShop(w: World): void {
  w.open = true;
  w.stats.runs++;
  if (w.queue[0]) w.queue[0].atCounterSince ??= w.time;
}

/** Called when a spell stops for any reason. Anything half-done is dropped. */
export function closeShop(w: World): void {
  w.open = false;
  w.task = null;
  const a = w.apprentice;
  a.activity = 'idle';
  a.brewing = undefined;
  a.says = undefined;
  // Never leave the player staring at an empty shop: someone is always waiting for the next Run.
  if (w.queue.length === 0) addCustomer(w);
}

/** Nudge the player toward loops once pressing Run gets repetitive. */
export function afterRun(w: World): void {
  if (w.stats.runs === 3 && !w.owned.includes('page:repeat') && !w.discoveries.includes('while')) {
    log(w, 'Pressing Run for every customer is tiring! The Spellbook page "Repeat" (in the shop) teaches your apprentice to keep going on their own.', 'info');
  }
}

/** Reward concepts used for the first time. Returns the new ones. */
export function applyDiscoveries(w: World, features: string[]): string[] {
  const found = features.filter((f) => DISCOVERIES[f] && !w.discoveries.includes(f));
  for (const f of found) {
    w.discoveries.push(f);
    earn(w, DISCOVERIES[f].bonus);
    log(w, `✨ You discovered ${DISCOVERIES[f].label}! +${DISCOVERIES[f].bonus} 🪙`, 'reward');
  }
  return found;
}

// ---------------------------------------------------------------------------
// Shopping
// ---------------------------------------------------------------------------

export function itemCost(w: World, id: ShopItemId): number | undefined {
  return SHOP.find((i) => i.id === id)!.cost(w);
}

export function buy(w: World, id: ShopItemId): boolean {
  const item = SHOP.find((i) => i.id === id)!;
  const cost = item.cost(w);
  if (cost === undefined || !item.visible(w) || w.coins < cost) return false;
  w.coins -= cost;
  if (id === 'cauldron') {
    w.cauldronLevel++;
    log(w, `🔥 Your cauldron burns hotter! Brewing is now ${Math.round((1 - CAULDRON_FACTOR ** w.cauldronLevel) * 100)}% faster.`, 'reward');
    return true;
  }
  w.owned.push(id);
  if (id === 'page:repeat') w.pages.push('repeat');
  if (id === 'page:choices') w.pages.push('choices');
  if (id === 'recipe:mana') {
    log(w, '💧 You learned the mana potion recipe! Wizards will start visiting, and they pay well.', 'reward');
  } else {
    log(w, `📖 New Spellbook page: ${item.title.replace('Spellbook: ', '')}!`, 'reward');
  }
  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function earn(w: World, coins: number) {
  w.coins += coins;
  w.lifetimeCoins += coins;
}

export function log(w: World, text: string, tone: LedgerEntry['tone'] = 'info', detail?: string): void {
  w.ledger.push({ id: w.nextId++, time: w.time, text, tone, detail });
  if (w.ledger.length > LEDGER_CAP) w.ledger.splice(0, w.ledger.length - LEDGER_CAP);
}
