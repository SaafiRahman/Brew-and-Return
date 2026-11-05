import { describe, expect, it } from 'vitest';
import { CHALKBOARD } from '../src/game/content';
import {
  advanceTime,
  applyDiscoveries,
  buyPage,
  buyUpgrade,
  createGame,
  practiceCustomer,
  practiceReceipt,
  serveFront,
  spawnInterval,
  TICK_MS,
} from '../src/game/engine';
import { chalkboardSymptoms, customerMix } from '../src/game/progression';
import type { CallResult, Customer, GameState } from '../src/game/types';

const ok = (value: any): CallResult => ({ kind: 'ok', value, stdout: '' });

/** A perfect apprentice who knows everything already. */
const perfect = (c: Customer): CallResult => ok(c.expected);

/** An apprentice who only knows the concepts on their owned pages. */
function learner(s: GameState) {
  return (c: Customer): CallResult => {
    if (c.order.quantity !== undefined) return s.pages.includes('loops') ? ok(c.expected) : ok(c.order.potion!);
    if (c.order.symptom) {
      const small = ['headache', 'cough', 'sleepy'];
      if (s.pages.includes('dictionaries')) return ok(CHALKBOARD[c.order.symptom]);
      if (s.pages.includes('conditionals') && small.includes(c.order.symptom)) return ok(CHALKBOARD[c.order.symptom]);
      return ok('calm potion');
    }
    return ok(c.order.potion!);
  };
}

/** Run the shop for `seconds` of game time, serving with `solve`. Buys pages when it can. */
function play(s: GameState, seconds: number, solve: (c: Customer) => CallResult, shop = true) {
  const ticks = (seconds * 1000) / TICK_MS;
  for (let t = 0; t < ticks; t++) {
    s.open = true;
    advanceTime(s, 1);
    if (t % 12 === 0 && s.queue.length) serveFront(s, solve(s.queue[0]));
    if (shop) for (const p of s.availablePages) buyPage(s, p);
  }
}

describe('a new game', () => {
  it('starts with Old Maggie waiting for a health potion', () => {
    const s = createGame(1);
    expect(s.queue).toHaveLength(1);
    expect(s.queue[0].order).toEqual({ potion: 'health potion' });
    expect(s.open).toBe(false);
    expect(s.code).toContain('return ___');
  });

  it('pays for the first correct potion right away', () => {
    const s = createGame(1);
    const r = serveFront(s, ok('health potion'))!;
    expect(r.verdict).toBe('correct');
    expect(s.coins).toBeGreaterThanOrEqual(5);
    expect(s.stage).toBe(1);
  });

  it('does not spawn customers while closed', () => {
    const s = createGame(1);
    advanceTime(s, 1000);
    expect(s.queue).toHaveLength(1);
    expect(s.tick).toBe(0);
  });
});

describe('progression', () => {
  it('sends a mana-potion teaser after the first coin', () => {
    const s = createGame(2);
    serveFront(s, ok('health potion'));
    s.open = true;
    advanceTime(s, 20);
    expect(s.queue[0].teaser).toBe(true);
    expect(s.queue[0].order.potion).toBe('mana potion');
    // Old code fails, but teasers cost nothing.
    const rep = s.reputation;
    const r = serveFront(s, ok('health potion'))!;
    expect(r.verdict).toBe('wrong');
    expect(r.repDelta).toBe(0);
    expect(s.reputation).toBe(rep);
    expect(s.open).toBe(false);
  });

  it('gates the healer behind the Conditionals page, then suggests it', () => {
    const s = createGame(3);
    play(s, 60, (c) => ok(c.order.potion ?? 'calm potion'), false);
    expect(s.stage).toBe(2);
    const healerReceipt = s.ledger.find((e) => e.type === 'receipt' && e.receipt.customer.kind === 'healer');
    expect(healerReceipt?.type === 'receipt' && healerReceipt.receipt.suggestPage).toBe('conditionals');
    expect(s.availablePages).toContain('conditionals');
    // No more healers until the page is bought.
    expect(customerMix(s).map((m) => m.kind)).toEqual(['villager']);
    expect(buyPage(s, 'conditionals')).toBe(s.coins + 20 >= 20);
    expect(customerMix(s).map((m) => m.kind)).toContain('healer');
  });

  it('grants a page for free when the player solves a teaser unaided', () => {
    const s = createGame(4);
    const freePages = new Set<string>();
    for (let i = 0; i < 24; i++) {
      play(s, 5, perfect, false);
      for (const e of s.ledger) if (e.type === 'receipt' && e.receipt.freePage) freePages.add(e.receipt.freePage);
    }
    expect(s.pages).toEqual(expect.arrayContaining(['conditionals', 'dictionaries', 'loops']));
    expect([...freePages].sort()).toEqual(['conditionals', 'dictionaries', 'loops']);
  });

  it('grows the chalkboard in the busy season', () => {
    const s = createGame(5);
    expect(chalkboardSymptoms(s)).toEqual([]);
    s.stage = 2;
    expect(chalkboardSymptoms(s)).toHaveLength(3);
    s.stage = 3;
    expect(chalkboardSymptoms(s)).toHaveLength(8);
  });

  it('a learner who buys each page reaches every customer within ~10 minutes', () => {
    for (const seed of [11, 22, 33, 44, 55]) {
      const s = createGame(seed);
      const solve = learner(s);
      let reachedEnd = -1;
      for (let sec = 0; sec < 15 * 60 && reachedEnd < 0; sec += 10) {
        play(s, 10, solve);
        if (s.stage === 5) reachedEnd = sec + 10;
      }
      expect(reachedEnd, `seed ${seed}`).toBeGreaterThan(0);
      expect(reachedEnd, `seed ${seed}`).toBeLessThanOrEqual(12 * 60);
    }
  });
});

describe('economy', () => {
  it('wrong answers cost a little reputation and pause after a streak', () => {
    const s = createGame(6);
    serveFront(s, ok('health potion'));
    s.stage = 1;
    s.teaserSpawned = true;
    s.open = true;
    for (let i = 0; i < 3; i++) {
      advanceTime(s, 100);
      serveFront(s, ok('nothing'));
    }
    expect(s.reputation).toBeLessThan(52);
    expect(s.open).toBe(false);
  });

  it('reputation never drops below the floor', () => {
    const s = createGame(7);
    s.stage = 1;
    s.reputation = 11;
    for (let i = 0; i < 10; i++) {
      s.open = true;
      advanceTime(s, 100);
      serveFront(s, ok('nope'));
    }
    expect(s.reputation).toBe(10);
  });

  it('upgrades cost coins and take effect', () => {
    const s = createGame(8);
    const before = spawnInterval(s);
    expect(buyUpgrade(s, 'sign')).toBe(false);
    s.coins = 100;
    expect(buyUpgrade(s, 'sign')).toBe(true);
    expect(s.coins).toBe(85);
    expect(spawnInterval(s)).toBeLessThan(before);
  });

  it('rewards each discovery once', () => {
    const s = createGame(9);
    expect(applyDiscoveries(s, ['if', 'dict', 'unknown'])).toEqual(['if', 'dict']);
    expect(s.coins).toBe(25);
    expect(applyDiscoveries(s, ['if'])).toEqual([]);
    expect(s.coins).toBe(25);
  });

  it('knights pay per potion', () => {
    const s = createGame(10);
    s.queue = [{ id: 99, kind: 'knight', name: 'Sir P', emoji: '🛡️', line: '', order: { potion: 'luck potion', quantity: 4 }, expected: Array(4).fill('luck potion'), teaser: false }];
    const r = serveFront(s, ok(Array(4).fill('luck potion')))!;
    expect(r.coins).toBe(12);
  });
});

describe('practice', () => {
  it('judges without changing coins, reputation or the queue', () => {
    const s = createGame(12);
    const snapshot = { coins: s.coins, rep: s.reputation, queue: s.queue.length, rng: s.rngState };
    const c = practiceCustomer(s);
    expect(c.order).toEqual(s.queue[0].order);
    const r = practiceReceipt(s, c, ok('health potion'));
    expect(r.practice).toBe(true);
    expect(r.verdict).toBe('correct');
    expect({ coins: s.coins, rep: s.reputation, queue: s.queue.length, rng: s.rngState }).toEqual(snapshot);
  });
});
