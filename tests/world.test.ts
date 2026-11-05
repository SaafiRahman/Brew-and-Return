import { describe, expect, it } from 'vitest';
import { PATIENCE, POTIONS, STARTER_CODE } from '../src/game/content';
import { explainError, similar } from '../src/game/hints';
import { addCustomer, advance, applyDiscoveries, beginAction, buy, closeShop, createWorld, openShop } from '../src/game/world';
import type { Json, World } from '../src/game/types';

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
  act(w, 'brew', 'health potion');
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
    expect(w.queue[0].wants).toBe('health potion');
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
    act(w, 'brew', 'health potion');
    expect(w.apprentice.holding).toBe('health potion');
    expect(act(w, 'serve')).toBe(true);
    expect(w.coins).toBe(POTIONS['health potion'].price + 1);
    expect(w.time).toBeLessThan(5);
    expect(w.stats.served).toBe(1);
  });
});

describe('actions', () => {
  it('brew takes time and walks to the cauldron', () => {
    const w = running();
    w.apprentice.spot = 'counter';
    const t0 = w.time;
    act(w, 'brew', 'Health  Potion ');
    expect(w.time - t0).toBeGreaterThanOrEqual(2.6 - 1e-9);
    expect(w.apprentice.spot).toBe('cauldron');
  });

  it('brew rejects unknown or unlearned potions with a friendly error', () => {
    const w = running();
    expect(() => act(w, 'brew', 'helth potion')).toThrow(/doesn't know a potion called "helth potion".*"health potion"/);
    expect(() => act(w, 'brew', 'mana potion')).toThrow(/haven't learned the mana potion recipe/);
    expect(() => act(w, 'brew')).toThrow(/needs the name of a potion/);
  });

  it('brewing with full hands just makes the apprentice shrug', () => {
    const w = running();
    act(w, 'brew', 'health potion');
    expect(act(w, 'brew', 'health potion')).toBe(false);
    expect(w.apprentice.holding).toBe('health potion');
  });

  it('serving with empty hands is a shrug, not an error', () => {
    const w = running();
    expect(act(w, 'serve')).toBe(false);
  });

  it('serve waits at the counter for the next customer', () => {
    const w = running();
    w.spawnTimer = 6;
    act(w, 'brew', 'health potion');
    act(w, 'serve');
    expect(w.queue).toHaveLength(0);
    act(w, 'brew', 'health potion');
    const t0 = w.time;
    expect(act(w, 'serve')).toBe(true);
    expect(w.time).toBeGreaterThan(t0);
    expect(w.stats.served).toBe(2);
  });

  it('order tells you what the customer at the counter wants', () => {
    const w = running();
    expect(act(w, 'order')).toBe('health potion');
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
    act(w, 'brew', 'health potion');
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
    addCustomer(w, 'mana potion');
    const coins = w.coins;
    act(w, 'brew', 'health potion');
    expect(act(w, 'serve')).toBe(false);
    expect(w.queue[0].wrongTries).toBe(1);
    expect(w.apprentice.holding).toBeNull(); // the rejected potion is wasted
    act(w, 'brew', 'mana potion');
    expect(act(w, 'serve')).toBe(true);
    expect(w.coins - coins).toBe(POTIONS['mana potion'].price / 2);
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
    expect(w.queue.every((c) => c.wants === 'health potion')).toBe(true);
    w.owned.push('recipe:mana');
    for (let i = 0; i < 30; i++) addCustomer(w);
    expect(w.queue.some((c) => c.wants === 'mana potion')).toBe(true);
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
    act(w, 'brew', 'health potion');
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
    [{ errorType: 'NameError', message: "name 'health' is not defined" }, /wrap it in quotes/],
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
