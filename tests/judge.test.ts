import { describe, expect, it } from 'vitest';
import { judge } from '../src/game/judge';
import { explainError, explainWrong } from '../src/game/hints';
import type { CallResult, Customer } from '../src/game/types';

const ok = (value: any): CallResult => ({ kind: 'ok', value, stdout: '' });
const villager = { kind: 'villager', order: { potion: 'mana potion' }, expected: 'mana potion' } as Pick<Customer, 'kind' | 'order' | 'expected'>;
const healer = { kind: 'healer', order: { symptom: 'headache' }, expected: 'calm potion' } as Pick<Customer, 'kind' | 'order' | 'expected'>;
const knight = {
  kind: 'knight',
  order: { potion: 'luck potion', quantity: 3 },
  expected: ['luck potion', 'luck potion', 'luck potion'],
} as Pick<Customer, 'kind' | 'order' | 'expected'>;

describe('judge', () => {
  it('accepts the right potion, ignoring case and spacing', () => {
    expect(judge(villager, ok('mana potion')).verdict).toBe('correct');
    expect(judge(villager, ok('  Mana   Potion ')).verdict).toBe('correct');
  });

  it('rejects the wrong potion with a hint about order.potion', () => {
    const j = judge(villager, ok('health potion'));
    expect(j.verdict).toBe('wrong');
    expect(j.hint).toContain('order.potion');
  });

  it('explains a missing return', () => {
    expect(judge(villager, ok(null)).hint).toMatch(/forget to `return`/);
  });

  it('accepts a list (or tuple-as-list) for knights', () => {
    expect(judge(knight, ok(['luck potion', 'Luck Potion', 'luck potion'])).verdict).toBe('correct');
    expect(judge(knight, ok(['luck potion'])).hint).toMatch(/counted 1 potion but wanted 3/);
    expect(judge(knight, ok('luck potion')).hint).toMatch(/list/);
  });

  it('explains an empty order.potion for symptom orders', () => {
    expect(judge(healer, ok(null)).hint).toMatch(/nothing to hand over for "headache".*chalkboard/);
  });

  it('notices when the symptom is handed back', () => {
    expect(judge(healer, ok('headache')).hint).toMatch(/That's the symptom/);
  });

  it('handles timeouts and errors kindly', () => {
    expect(judge(villager, { kind: 'timeout' }).hint).toMatch(/fell asleep/);
    const err: CallResult = { kind: 'error', errorType: 'NameError', message: "name '___' is not defined", line: 2, traceback: 'tb', stdout: '' };
    const j = judge(villager, err);
    expect(j.verdict).toBe('error');
    expect(j.hint).toMatch(/blank/);
    expect(j.traceback).toBe('tb');
  });

  it('describes unserializable returns', () => {
    expect(explainWrong(villager, { __type__: 'function', __repr__: '<function f>' })).toMatch(/spell \(a function\)/);
  });
});

describe('explainError', () => {
  it.each([
    [{ errorType: 'NameError', message: "name 'health' is not defined" }, /wrap them in quotes/],
    [{ errorType: 'NameError', message: "name 'recipes' is not defined", line: 3 }, /`recipes`.*line 3/],
    [{ errorType: 'SyntaxError', message: "expected ':'", line: 2 }, /colon/],
    [{ errorType: 'SyntaxError', message: 'unterminated string literal (detected at line 2)', line: 2 }, /closing quote/],
    [{ errorType: 'SyntaxError', message: "invalid syntax. Maybe you meant '==' or ':=' instead of '='?", line: 2 }, /`==`/],
    [{ errorType: 'IndentationError', message: "expected an indented block after function definition on line 1", line: 2 }, /indented/],
    [{ errorType: 'SyntaxError', message: "'return' outside function", line: 2 }, /inside `serve`/],
    [{ errorType: 'KeyError', message: "'fever'" }, /no entry for "fever"/],
    [{ errorType: 'MissingServe', message: '' }, /`def serve\(order\):`/],
    [{ errorType: 'TypeError', message: 'serve() takes 0 positional arguments but 1 was given' }, /exactly one input/],
    [{ errorType: 'TypeError', message: 'can only concatenate str (not "int") to str' }, /words and numbers/],
  ])('%o', (err, pattern) => {
    expect(explainError(err)).toMatch(pattern);
  });

  it('lists the fields an order actually has', () => {
    const hint = explainError({ errorType: 'AttributeError', message: "'Order' object has no attribute 'potion'" }, { symptom: 'cough' });
    expect(hint).toMatch(/doesn't have a `.potion`.*`order.symptom`/);
  });
});
