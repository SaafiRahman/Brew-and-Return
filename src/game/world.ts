import {
  ailment,
  BASKET_SIZE,
  BREW_TIME,
  CAULDRON_FACTOR,
  CUSTOMER_NAMES,
  CUSTOMERS,
  DISCOVERIES,
  FIRST_SPAWN,
  HANDOVER_TIME,
  HEALER_FEE,
  KNIGHT_BONUS,
  KNIGHT_POTIONS,
  knownAilments,
  knownPotions,
  MAX_QUEUE,
  PATIENCE,
  PATIENCE_PER_EXTRA,
  potionCode,
  potionName,
  POTIONS,
  QUICK_TIP_PER_EXTRA,
  QUICK_TIP_WINDOW,
  READ_TIME,
  SAY_TIME,
  SHOP,
  SHRUG_TIME,
  SPAWN_INTERVAL,
  STARTER_CODE,
  WALK_TIME,
} from './content';
import { nextRandom, pick, randInt } from './rng';
import type { Customer, CustomerKind, Json, LedgerEntry, PotionId, Receipt, ShopItemId, Step, Task, World } from './types';

export const LEDGER_CAP = 80;

export function createWorld(seed = Date.now()): World {
  const w: World = {
    version: 4,
    time: 0,
    coins: 0,
    lifetimeCoins: 0,
    owned: [],
    cauldronLevel: 0,
    tipJarLevel: 0,
    pages: ['first'],
    apprentice: { spot: 'cauldron', holding: [], activity: 'idle' },
    queue: [],
    spawnTimer: FIRST_SPAWN,
    nextId: 1,
    rngState: seed | 0,
    stats: { served: 0, rejected: 0, leftUnhappy: 0, runs: 0, knightsServed: 0 },
    discoveries: [],
    flags: [],
    code: STARTER_CODE,
    speed: 1,
    ledger: [],
    open: false,
    task: null,
  };
  // The very first customer is already waiting and wants the simplest thing.
  addCustomer(w, 'villager');
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
      log(w, `${front.emoji} ${front.name} got tired of waiting and left without ${describeOrder(front)}.`, 'warn');
      if (w.queue[0]) w.queue[0].atCounterSince = w.time;
    }
  }
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export function addCustomer(w: World, kind?: CustomerKind, detail: { ailment?: string; wants?: PotionId[] } = {}): Customer {
  if (!kind) {
    const options = CUSTOMERS.map((d) => ({ kind: d.kind, weight: d.weight(w) })).filter((o) => o.weight > 0);
    let r = nextRandom(w) * options.reduce((sum, o) => sum + o.weight, 0);
    kind = options.find((o) => (r -= o.weight) < 0)?.kind ?? 'villager';
  }
  const def = CUSTOMERS.find((d) => d.kind === kind)!;
  let wants: PotionId[];
  let ail: string | undefined;
  switch (kind) {
    case 'villager':
      wants = ['health'];
      break;
    case 'wizard':
      wants = ['mana'];
      break;
    case 'healer': {
      const a = detail.ailment ? ailment(detail.ailment)! : pick(w, knownAilments(w).length ? knownAilments(w) : [ailment('fever')!]);
      ail = a.name;
      wants = [a.cure];
      break;
    }
    case 'knight':
      wants = detail.wants ?? Array.from({ length: randInt(w, 2, 3) }, () => pick(w, KNIGHT_POTIONS));
      break;
  }
  const name = pick(w, CUSTOMER_NAMES);
  const patience = PATIENCE + PATIENCE_PER_EXTRA * (wants.length - 1);
  const c: Customer = {
    id: w.nextId++,
    kind,
    name: kind === 'knight' ? `${nextRandom(w) < 0.5 ? 'Sir' : 'Dame'} ${name}` : name,
    emoji: pick(w, def.emojis),
    wants,
    ailment: ail,
    patience,
    maxPatience: patience,
    rewardMult: 1,
    wrongTries: 0,
  };
  if (w.queue.length === 0) c.atCounterSince = w.time;
  w.queue.push(c);
  return c;
}

/** "a health potion", "something for a fever", "2 health potions and a mana potion". */
export function describeOrder(c: Customer): string {
  if (c.ailment) return `something for a ${c.ailment}`;
  return describePotions(c.wants);
}

export function describePotions(potions: PotionId[]): string {
  const counts = new Map<PotionId, number>();
  for (const p of potions) counts.set(p, (counts.get(p) ?? 0) + 1);
  const parts = [...counts].map(([p, n]) => (n === 1 ? `a ${potionName(p)}` : `${n} ${potionName(p)}s`));
  return parts.length <= 1 ? (parts[0] ?? 'nothing') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

/** What `order()` gives for this customer, as plain data. */
export function orderJson(c: Customer): Json {
  if (c.ailment) return c.ailment;
  if (c.kind === 'knight') return c.wants.map(potionJson);
  return potionJson(c.wants[0]);
}

/** What `order()` gives for this customer, written as Python. */
export function orderCode(c: Customer): string {
  if (c.ailment) return `"${c.ailment}"`;
  if (c.kind === 'knight') return `[${c.wants.map(potionCode).join(', ')}]`;
  return potionCode(c.wants[0]);
}

/** What the player handed over, written as Python. */
function deliveryCode(potions: PotionId[], asList: boolean): string {
  return asList || potions.length !== 1 ? `[${potions.map(potionCode).join(', ')}]` : potionCode(potions[0]);
}

/** Coins this customer pays for a correct order, before wrong-try penalties. */
export function basePay(c: Customer): number {
  const potions = c.wants.reduce((sum, p) => sum + POTIONS[p].price, 0);
  if (c.kind === 'healer') return potions + HEALER_FEE;
  if (c.kind === 'knight') return Math.round(potions * KNIGHT_BONUS);
  return potions;
}

const sameBag = (a: PotionId[], b: PotionId[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

// ---------------------------------------------------------------------------
// Actions requested by the player's code
// ---------------------------------------------------------------------------

export const ACTIONS = ['brew', 'serve', 'order', 'say'] as const;

export function brewTime(w: World): number {
  return BREW_TIME * CAULDRON_FACTOR ** w.cauldronLevel;
}

/** How many potions the apprentice can carry. */
export function capacity(w: World): number {
  return w.owned.includes('contract:knight') ? BASKET_SIZE : 1;
}

const shrug = (text: string, result: Json = false): Step => ({ kind: 'say', text, time: SHRUG_TIME, activity: 'shrugging', result });

/** Start an action. Invalid requests come back already done with an `error`. */
export function beginAction(w: World, action: string, args: Json[]): Task {
  const task: Task = { action, steps: [], elapsed: 0, done: false, result: null };
  const fail = (error: string) => ({ ...task, done: true, error });
  const a = w.apprentice;
  const walkTo = (to: 'cauldron' | 'counter') => (a.spot === to ? [] : [{ kind: 'walk', to, time: WALK_TIME } as Step]);

  switch (action) {
    case 'brew': {
      const known = knownPotions(w);
      const examples = known.slice(0, 2).map((p) => `\`${potionCode(p)}\``).join(' or ');
      if (args.length !== 1) return fail('brew needs to know which potion, like `brew(Potion.health)`.');
      const arg = args[0];
      if (Array.isArray(arg)) {
        // A knight's whole order: a muddle, not a crash. The knight will wait (and eventually leave).
        hintOnce(
          w,
          w.pages.includes('loops')
            ? 'That\'s a whole list of potions! Brew them one at a time with a `for` loop: `for p in wanted:`'
            : 'That\'s a whole list of potions, and your apprentice can only brew one at a time. The Spellbook page "Lists & Loops" shows how to work through a list.',
        );
        task.steps = [shrug('One potion at a time, please!')];
        break;
      }
      if (typeof arg === 'string') {
        const ail = ailment(arg);
        if (ail) {
          hintOnce(w, `"${arg}" is what the patient has, not a potion. The chalkboard says ${arg} is cured by \`${potionCode(ail.cure)}\`.`);
          task.steps = [shrug(`I can't brew a ${arg}!`)];
          break;
        }
        return fail(`"${arg}" is just words to your apprentice. Name the potion from the Potion list instead, like ${examples}.`);
      }
      const potion = asPotion(arg);
      if (!potion) return fail(`Your apprentice can only brew potions, like ${examples}.`);
      if (!known.includes(potion)) {
        return fail(`You haven't learned the ${potionName(potion)} recipe yet. Buy it in the shop!`);
      }
      if (a.holding.length >= capacity(w)) {
        task.steps = [shrug(capacity(w) > 1 ? 'My basket is full!' : 'My hands are full!')];
      } else {
        task.steps = [...walkTo('cauldron'), { kind: 'brew', potion, time: brewTime(w) }];
      }
      break;
    }
    case 'serve': {
      if (args.length) return fail("serve() doesn't need anything in its brackets. It hands over whatever you're holding.");
      if (!a.holding.length) {
        task.steps = [shrug("I'm not holding a potion!")];
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

/** Log a hint once per customer at the counter, so a looping spell doesn't flood the ledger. */
function hintOnce(w: World, text: string) {
  const c = w.queue[0];
  if (c?.hinted) return;
  if (c) c.hinted = true;
  log(w, text, 'warn');
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
      a.holding.push(step.potion);
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
      task.result = orderJson(c);
      break;
    }
    case 'handover': {
      const c = w.queue[0];
      if (!c || !a.holding.length) {
        task.steps.unshift({ kind: 'waitCustomer' }, step);
        return;
      }
      task.result = handOver(w, c, a.holding);
      a.holding = [];
      break;
    }
  }
}

/** Give everything the apprentice holds to the customer at the counter. Returns whether they accepted it. */
function handOver(w: World, c: Customer, potions: PotionId[]): boolean {
  const ok = sameBag(potions, c.wants);
  const receipt: Receipt = {
    customer: `${c.emoji} ${c.name}`,
    asked: orderCode(c),
    gave: deliveryCode(potions, c.kind === 'knight'),
    expected: deliveryCode(c.wants, c.kind === 'knight'),
    ok,
    paid: 0,
    tip: 0,
  };

  if (ok) {
    w.queue.shift();
    const pay = Math.max(1, Math.round(basePay(c) * c.rewardMult));
    const window = QUICK_TIP_WINDOW + QUICK_TIP_PER_EXTRA * (c.wants.length - 1);
    const quick = c.wrongTries === 0 && c.atCounterSince !== undefined && w.time - c.atCounterSince <= window;
    const tip = quick ? 1 + w.tipJarLevel : 0;
    earn(w, pay + tip);
    receipt.paid = pay;
    receipt.tip = tip;
    w.stats.served++;
    const extra = c.wrongTries ? ` (less after ${c.wrongTries} wrong ${c.wrongTries === 1 ? 'try' : 'tries'})` : '';
    const what = c.ailment ? `${describePotions(potions)} for a ${c.ailment}` : describePotions(potions);
    log(w, `${c.emoji} ${c.name} bought ${what}. +${pay}${tip ? ` +${tip} tip` : ''} 🪙${extra}`, 'sale', undefined, receipt);
    if (c.kind === 'knight') {
      w.stats.knightsServed++;
      if (!w.flags.includes('chapter1')) {
        w.flags.push('chapter1');
        log(
          w,
          "🎉 A knight's whole order, brewed by your own spell! You've learned loops, choices, variables, strings, dictionaries and lists. That's the end of the first chapter. Your shop keeps running, and more customers are on their way soon.",
          'reward',
        );
      }
    }
    if (w.queue[0]) w.queue[0].atCounterSince = w.time;
    return true;
  }

  c.wrongTries++;
  c.rewardMult /= 2;
  w.stats.rejected++;
  if (c.wrongTries === 1) {
    log(w, `${c.emoji} ${c.name} wanted ${describeOrder(c)}, not ${describePotions(potions)}. They'll pay less now. ${rejectionHint(w, c)}`, 'warn', undefined, receipt);
  } else {
    log(w, `${c.emoji} ${c.name} turned away ${describePotions(potions)}. They still want ${describeOrder(c)}.`, 'warn', undefined, receipt);
  }
  return false;
}

function rejectionHint(w: World, c: Customer): string {
  switch (c.kind) {
    case 'healer': {
      const cure = `The chalkboard says ${c.ailment} is cured by \`${potionCode(c.wants[0])}\`.`;
      return w.pages.includes('remedies')
        ? cure
        : `${cure} Healers tell \`order()\` the ailment, not the potion. The Spellbook page "Remedies" shows how to match them up.`;
    }
    case 'knight':
      return w.pages.includes('loops')
        ? 'Knights want every potion on their list, all in one go.'
        : 'Knights want every potion on their list, all in one go. The Spellbook page "Lists & Loops" shows how.';
    default:
      return w.owned.includes('page:choices') || w.discoveries.includes('if')
        ? 'Check what they want with `order()` before brewing.'
        : 'Not every customer wants the same thing. The Spellbook page "Choices" teaches your apprentice to read orders.';
  }
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

const BOUGHT: Partial<Record<ShopItemId, string>> = {
  'recipe:mana': '💧 You learned the mana potion recipe! Wizards will start visiting, and they pay well.',
  'recipe:healer':
    '🩺 The chalkboard is up! You learned `Potion.cooling` and `Potion.sleep`. Healers will start visiting, and they tell you the ailment, not the potion.',
  almanac: '📗 Three more ailments went up on the chalkboard. Word is spreading: healers are on their way!',
  'contract:knight': `🛡️ The knights signed your contract! Your apprentice now has a basket that holds ${BASKET_SIZE} potions.`,
};

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
  if (id === 'tipjar') {
    w.tipJarLevel++;
    log(w, `🫙 Quick, first-try service now earns a tip of ${1 + w.tipJarLevel} coins.`, 'reward');
    return true;
  }
  w.owned.push(id);
  if (id.startsWith('page:')) {
    w.pages.push(id.slice(5) as World['pages'][number]);
    log(w, `📖 New Spellbook page: ${item.title.replace('Spellbook: ', '')}!`, 'reward');
  } else {
    log(w, BOUGHT[id] ?? `You bought ${item.title}.`, 'reward');
  }
  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Potions cross the code boundary as `{"potion": "health"}`; the runner shows them as `Potion.health`. */
export function potionJson(id: PotionId): Json {
  return { potion: id };
}

function asPotion(v: Json): PotionId | undefined {
  if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.potion === 'string' && v.potion in POTIONS) {
    return v.potion as PotionId;
  }
  return undefined;
}

function earn(w: World, coins: number) {
  w.coins += coins;
  w.lifetimeCoins += coins;
}

export function log(w: World, text: string, tone: LedgerEntry['tone'] = 'info', detail?: string, receipt?: Receipt): void {
  w.ledger.push({ id: w.nextId++, time: w.time, text, tone, detail, receipt });
  if (w.ledger.length > LEDGER_CAP) w.ledger.splice(0, w.ledger.length - LEDGER_CAP);
}
