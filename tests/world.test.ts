import { describe, expect, it } from 'vitest';
import { HEALER_FEE, KNIGHT_BONUS, PATIENCE, POTIONS, STARTER_CODE } from '../src/game/content';
import { explainError, similar } from '../src/game/hints';
import { addCustomer, advance, applyDiscoveries, beginAction, buy, closeShop, createWorld, openShop } from '../src/game/world';
import type { Json, World } from '../src/game/types';

/** Potions as the runner sends them (Potion.health in Python). */
const P = { health: { potion: 'health' }, mana: { potion: 'mana' }, cooling: { potion: 'cooling' }, sleep: { potion: 'sleep' } } as const;

const CURES: Record<string, Json> = {
  fever: P.cooling,
  sunburn: P.cooling,
  sleepless: P.sleep,
  nightmares: P.sleep,
  'scraped knee': P.health,
  bruise: P.health,
};

const DT = 0.05;

/** Perform one action to completion, like a spell would. Returns the result, or throws the action's error. */
function act(w: World, action: string, ...args: Json[]): Json {
  const task = beginAction(w, action, args);
  if (task.error) throw new Error(task.error);
  for (let i = 0; i < 20_000 && !task.done; i++) advance(w, DT);
  if (!task.done) throw new Error(`${action} never finished`);
  return task.result;
}

function running(seed = 1): World {
  const w = createWorld(seed);
  openShop(w);
  return w;
}

/** Run a script function repeatedly for `seconds` of game time. */
function loop(w: World, seconds: number, body: (w: World) => void) {
  const end = w.time + seconds;
  while (w.time < end) body(w);
}

const healthLoop = (w: World) => {
  act(w, 'brew', P.health);
  act(w, 'serve');
};
const smartLoop = (w: World) => {
  act(w, 'brew', act(w, 'order'));
  act(w, 'serve');
};

describe('a new shop', () => {
  it('starts closed with one customer wanting a health potion', () => {
    const w = createWorld(1);
    expect(w.open).toBe(false);
    expect(w.queue).toHaveLength(1);
    expect(w.queue[0].wants).toEqual(['health']);
    expect(w.code).toBe(STARTER_CODE);
  });

  it('freezes time while no spell is running', () => {
    const w = createWorld(1);
    advance(w, 100);
    expect(w.time).toBe(0);
    expect(w.queue[0].patience).toBe(PATIENCE);
  });

  it('the starter spell earns the first coins within seconds, with a quick-service tip', () => {
    const w = running();
    act(w, 'brew', P.health);
    expect(w.apprentice.holding).toEqual(['health']);
    expect(act(w, 'serve')).toBe(true);
    expect(w.coins).toBe(POTIONS.health.price + 1);
    expect(w.time).toBeLessThan(5);
    expect(w.stats.served).toBe(1);
  });
});

describe('actions', () => {
  it('brew takes time and walks to the cauldron', () => {
    const w = running();
    w.apprentice.spot = 'counter';
    const t0 = w.time;
    act(w, 'brew', P.health);
    expect(w.time - t0).toBeGreaterThanOrEqual(2.6 - 1e-9);
    expect(w.apprentice.spot).toBe('cauldron');
  });

  it('brew explains strings, unlearned recipes and missing potions kindly', () => {
    const w = running();
    expect(() => act(w, 'brew', 'health potion')).toThrow(/"health potion" is just words.*`Potion.health`/);
    expect(() => act(w, 'brew', P.mana)).toThrow(/haven't learned the mana potion recipe/);
    expect(() => act(w, 'brew')).toThrow(/needs to know which potion/);
    expect(() => act(w, 'brew', 3)).toThrow(/can only brew potions/);
  });

  it('brewing with full hands just makes the apprentice shrug', () => {
    const w = running();
    act(w, 'brew', P.health);
    expect(act(w, 'brew', P.health)).toBe(false);
    expect(w.apprentice.holding).toEqual(['health']);
  });

  it('serving with empty hands is a shrug, not an error', () => {
    const w = running();
    expect(act(w, 'serve')).toBe(false);
  });

  it('serve waits at the counter for the next customer', () => {
    const w = running();
    w.spawnTimer = 6;
    act(w, 'brew', P.health);
    act(w, 'serve');
    expect(w.queue).toHaveLength(0);
    act(w, 'brew', P.health);
    const t0 = w.time;
    expect(act(w, 'serve')).toBe(true);
    expect(w.time).toBeGreaterThan(t0);
    expect(w.stats.served).toBe(2);
  });

  it('order tells you what the customer at the counter wants', () => {
    const w = running();
    expect(act(w, 'order')).toEqual(P.health);
    expect(w.apprentice.spot).toBe('counter');
  });

  it('say adds to the ledger', () => {
    const w = running();
    act(w, 'say', 'hello', 3);
    expect(w.ledger.at(-1)!.text).toContain('hello 3');
  });
});

describe('customers', () => {
  it('someone is always waiting when a spell ends', () => {
    const w = running();
    w.spawnTimer = 100;
    act(w, 'brew', P.health);
    act(w, 'serve');
    expect(w.queue).toHaveLength(0);
    closeShop(w);
    expect(w.queue).toHaveLength(1);
  });

  it('turn away the wrong potion, keep waiting, and pay half for the right one', () => {
    const w = running();
    buy(Object.assign(w, { coins: 100 }), 'page:repeat');
    buy(w, 'recipe:mana');
    w.queue = [];
    addCustomer(w, 'wizard');
    const coins = w.coins;
    act(w, 'brew', P.health);
    expect(act(w, 'serve')).toBe(false);
    expect(w.queue[0].wrongTries).toBe(1);
    expect(w.apprentice.holding).toEqual([]); // the rejected potion is wasted
    act(w, 'brew', P.mana);
    expect(act(w, 'serve')).toBe(true);
    expect(w.coins - coins).toBe(POTIONS.mana.price / 2);
  });

  it('leave when their patience runs out', () => {
    const w = running();
    w.spawnTimer = 1e9;
    advance(w, PATIENCE + 1);
    expect(w.queue).toHaveLength(0);
    expect(w.stats.leftUnhappy).toBe(1);
    expect(w.ledger.at(-1)!.text).toMatch(/left without/);
  });

  it('only lose patience at the counter, not while queueing', () => {
    const w = running();
    w.spawnTimer = 0;
    advance(w, 5);
    expect(w.queue.length).toBeGreaterThan(1);
    expect(w.queue[1].patience).toBe(PATIENCE);
  });

  it('only want mana potions once the recipe is known', () => {
    const w = running(7);
    for (let i = 0; i < 30; i++) addCustomer(w);
    expect(w.queue.every((c) => c.kind === 'villager')).toBe(true);
    w.owned.push('recipe:mana');
    for (let i = 0; i < 30; i++) addCustomer(w);
    expect(w.queue.some((c) => c.wants[0] === 'mana')).toBe(true);
  });
});

/** A world that owns everything up to (and including) `upTo` in the shop order. */
function owning(upTo: string, seed = 1): World {
  const w = running(seed);
  w.coins = 1000;
  for (const id of ['page:repeat', 'recipe:mana', 'page:choices', 'recipe:healer', 'page:remedies', 'almanac', 'page:recipes', 'contract:knight', 'page:loops'] as const) {
    expect(buy(w, id)).toBe(true);
    if (id === upTo) break;
  }
  w.queue = [];
  w.spawnTimer = 1e9;
  return w;
}

describe('healers', () => {
  it('only visit once the chalkboard is bought, and only with ailments it lists', () => {
    const w = owning('page:choices', 9);
    for (let i = 0; i < 40; i++) addCustomer(w);
    expect(w.queue.some((c) => c.kind === 'healer')).toBe(false);
    buy(w, 'recipe:healer');
    w.queue = [];
    for (let i = 0; i < 60; i++) addCustomer(w);
    const ailments = new Set(w.queue.filter((c) => c.kind === 'healer').map((c) => c.ailment));
    expect([...ailments].sort()).toEqual(['fever', 'scraped knee', 'sleepless']);
  });

  it('the almanac adds three more ailments', () => {
    const w = owning('almanac', 4);
    for (let i = 0; i < 120; i++) addCustomer(w);
    expect(new Set(w.queue.map((c) => c.ailment).filter(Boolean)).size).toBe(6);
  });

  it('order() gives the ailment; the right cure pays the potion plus a fee', () => {
    const w = owning('recipe:healer');
    addCustomer(w, 'healer', { ailment: 'fever' });
    expect(act(w, 'order')).toBe('fever');
    const coins = w.coins;
    act(w, 'brew', P.cooling);
    expect(act(w, 'serve')).toBe(true);
    expect(w.coins - coins).toBe(POTIONS.cooling.price + HEALER_FEE + 1);
  });

  it('brewing the ailment itself is a muddle with one hint, not a crash', () => {
    const w = owning('recipe:healer');
    addCustomer(w, 'healer', { ailment: 'sleepless' });
    expect(act(w, 'brew', 'sleepless')).toBe(false);
    expect(act(w, 'brew', 'sleepless')).toBe(false);
    const hints = w.ledger.filter((e) => e.text.includes('is what the patient has'));
    expect(hints).toHaveLength(1);
    expect(hints[0].text).toContain('`Potion.sleep`');
  });

  it('turning away the wrong cure points to the chalkboard', () => {
    const w = owning('recipe:healer');
    addCustomer(w, 'healer', { ailment: 'fever' });
    act(w, 'brew', P.health);
    expect(act(w, 'serve')).toBe(false);
    const e = w.ledger.at(-1)!;
    expect(e.text).toMatch(/fever is cured by `Potion.cooling`.*Remedies/);
    expect(e.receipt).toMatchObject({ asked: '"fever"', gave: 'Potion.health', expected: 'Potion.cooling', ok: false });
  });
});

describe('knights', () => {
  it('order a list, need the basket, and pay a bonus for the whole order', () => {
    const w = owning('contract:knight');
    addCustomer(w, 'knight', { wants: ['health', 'mana', 'health'] });
    expect(act(w, 'order')).toEqual([P.health, P.mana, P.health]);
    const coins = w.coins;
    act(w, 'brew', P.mana);
    act(w, 'brew', P.health);
    act(w, 'brew', P.health);
    expect(act(w, 'brew', P.health)).toBe(false); // the basket holds 3
    expect(act(w, 'serve')).toBe(true);
    expect(w.coins - coins).toBe(Math.round((3 + 8 + 3) * KNIGHT_BONUS) + 1);
    expect(w.ledger.at(-2)!.receipt).toMatchObject({ asked: '[Potion.health, Potion.mana, Potion.health]', ok: true });
    expect(w.flags).toContain('chapter1');
    expect(w.ledger.at(-1)!.text).toMatch(/end of the first chapter/);
  });

  it('turn away part of an order', () => {
    const w = owning('contract:knight');
    addCustomer(w, 'knight', { wants: ['health', 'health'] });
    act(w, 'brew', P.health);
    expect(act(w, 'serve')).toBe(false);
    expect(w.ledger.at(-1)!.text).toMatch(/wanted 2 health potions, not a health potion.*Lists & Loops/);
  });

  it('brewing a whole list is a muddle with a hint, not a crash', () => {
    const w = owning('contract:knight');
    addCustomer(w, 'knight', { wants: ['health', 'mana'] });
    expect(act(w, 'brew', [P.health, P.mana])).toBe(false);
    expect(w.ledger.at(-1)!.text).toMatch(/whole list of potions/);
  });

  it('get more patience for bigger orders', () => {
    const w = owning('contract:knight');
    const c = addCustomer(w, 'knight', { wants: ['health', 'health', 'mana'] });
    expect(c.maxPatience).toBe(PATIENCE + 20);
  });
});

describe('the tip jar', () => {
  it('makes quick tips bigger', () => {
    const w = running();
    w.lifetimeCoins = 100;
    w.coins = 100;
    expect(buy(w, 'tipjar')).toBe(true);
    const coins = w.coins;
    act(w, 'brew', P.health);
    act(w, 'serve');
    expect(w.coins - coins).toBe(POTIONS.health.price + 2);
  });
});

describe('the first three minutes', () => {
  it('manual runs → repeat loop → mana recipe → choices loop earns more', () => {
    const w = createWorld(3);
    // Three presses of Run with the starter spell.
    for (let i = 0; i < 3; i++) {
      openShop(w);
      healthLoop(w);
      closeShop(w);
    }
    expect(w.coins).toBeGreaterThanOrEqual(10);
    expect(buy(w, 'page:repeat')).toBe(true);

    openShop(w);
    loop(w, 45, healthLoop);
    expect(buy(w, 'recipe:mana')).toBe(true);

    // The old health-only loop now gets turned away by wizards.
    const before = { coins: w.coins, rejected: w.stats.rejected };
    loop(w, 60, healthLoop);
    const dumbRate = w.coins - before.coins;
    expect(w.stats.rejected).toBeGreaterThan(before.rejected);

    expect(buy(w, 'page:choices')).toBe(true);
    const mid = w.coins;
    loop(w, 60, smartLoop);
    const smartRate = w.coins - mid;
    expect(smartRate).toBeGreaterThan(dumbRate * 1.5);
  });
});

/** The spells from each Spellbook page, as the game sees them. */
const chainLoop = (w: World) => {
  const wanted = act(w, 'order');
  act(w, 'brew', typeof wanted === 'string' ? (CURES[wanted] ?? P.health) : wanted);
  act(w, 'serve');
};
const remediesKnowsThree = (w: World) => {
  const wanted = act(w, 'order');
  const three: Record<string, Json> = { fever: P.cooling, sleepless: P.sleep, 'scraped knee': P.health };
  act(w, 'brew', typeof wanted === 'string' ? (three[wanted] ?? wanted) : wanted);
  act(w, 'serve');
};
const fullLoop = (w: World) => {
  const wanted = act(w, 'order');
  if (Array.isArray(wanted)) for (const p of wanted) act(w, 'brew', p);
  else act(w, 'brew', typeof wanted === 'string' ? CURES[wanted] : wanted);
  act(w, 'serve');
};

/** Loop until we can afford `id`, then buy it. Returns the game seconds it took. */
function earnAndBuy(w: World, id: Parameters<typeof buy>[1], body: (w: World) => void, limit = 300): number {
  const t0 = w.time;
  while (!buy(w, id)) {
    body(w);
    if (w.time - t0 > limit) throw new Error(`couldn't afford ${id} in ${limit}s (have ${w.coins})`);
  }
  return w.time - t0;
}

describe('the first chapter (about ten minutes)', () => {
  it("each purchase is affordable with the previous page's spell, and the final spell serves everyone", () => {
    const w = createWorld(11);
    for (let i = 0; i < 3; i++) {
      openShop(w);
      healthLoop(w);
      closeShop(w);
    }
    expect(buy(w, 'page:repeat')).toBe(true);
    openShop(w);
    const spent: Record<string, number> = {};
    spent.mana = earnAndBuy(w, 'recipe:mana', healthLoop);
    spent.choices = earnAndBuy(w, 'page:choices', healthLoop);
    spent.healer = earnAndBuy(w, 'recipe:healer', smartLoop);
    // Healers get the wrong thing from the old spell, but the shop still earns.
    spent.remedies = earnAndBuy(w, 'page:remedies', smartLoop);
    spent.almanac = earnAndBuy(w, 'almanac', remediesKnowsThree);
    spent.recipes = earnAndBuy(w, 'page:recipes', remediesKnowsThree);
    spent.knight = earnAndBuy(w, 'contract:knight', chainLoop);
    spent.loops = earnAndBuy(w, 'page:loops', chainLoop);
    const total = Object.values(spent).reduce((a, b) => a + b, 0);
    // Game time spent earning: a few minutes, plus however long the player spends writing code.
    expect(total, JSON.stringify(spent)).toBeGreaterThan(120);
    expect(total, JSON.stringify(spent)).toBeLessThan(480);

    const before = { ...w.stats };
    loop(w, 120, fullLoop);
    expect(w.stats.rejected).toBe(before.rejected);
    expect(w.stats.knightsServed).toBeGreaterThan(3);
    expect(w.flags).toContain('chapter1');
  });
});

describe('shop', () => {
  it('only sells what is visible and affordable', () => {
    const w = createWorld(1);
    expect(buy(w, 'recipe:mana')).toBe(false); // needs Repeat first
    w.coins = 5;
    expect(buy(w, 'page:repeat')).toBe(false);
    w.coins = 10;
    expect(buy(w, 'page:repeat')).toBe(true);
    expect(w.pages).toContain('repeat');
    expect(buy(w, 'page:repeat')).toBe(false);
  });

  it('a faster cauldron brews faster', () => {
    const w = running();
    w.lifetimeCoins = 50;
    w.coins = 50;
    expect(buy(w, 'cauldron')).toBe(true);
    const t0 = w.time;
    act(w, 'brew', P.health);
    expect(w.time - t0).toBeLessThan(1.7);
  });

  it('rewards each discovery once', () => {
    const w = createWorld(1);
    expect(applyDiscoveries(w, ['while', 'if', 'nope'])).toEqual(['while', 'if']);
    expect(applyDiscoveries(w, ['while'])).toEqual([]);
    expect(w.coins).toBe(15);
  });
});

describe('hints', () => {
  it.each([
    [{ errorType: 'NameError', message: "name 'brw' is not defined", line: 2 }, /Did you mean `brew`/],
    [{ errorType: 'NameError', message: "name 'sevre' is not defined" }, /Did you mean `serve`/],
    [{ errorType: 'NameError', message: "name 'health' is not defined" }, /`Potion.health`/],
    [{ errorType: 'NameError', message: "name 'potion' is not defined" }, /capital P/],
    [{ errorType: 'NameError', message: "name 'true' is not defined" }, /`True`/],
    [{ errorType: 'TypeError', message: "brew() missing 1 required positional argument: 'potion'" }, /which potion/],
    [{ errorType: 'TypeError', message: 'serve() takes 0 positional arguments but 1 was given' }, /doesn't need anything/],
    [{ errorType: 'SyntaxError', message: "expected ':'", line: 1 }, /colon/],
    [{ errorType: 'IndentationError', message: "expected an indented block after 'while' statement on line 1", line: 2 }, /indented/],
    [{ errorType: 'ShopError', message: 'You haven\'t learned it.', line: 3 }, /learned it\. \(line 3\)/],
  ])('%o', (err, pattern) => expect(explainError(err)).toMatch(pattern));

  it('"did you mean" allows one typo', () => {
    expect(similar('serve', 'serv')).toBe(true);
    expect(similar('serve', 'srve')).toBe(true);
    expect(similar('order', 'ordr')).toBe(true);
    expect(similar('brew', 'stew')).toBe(false);
  });
});
