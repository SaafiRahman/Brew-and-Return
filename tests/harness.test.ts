import { readFileSync } from 'node:fs';
import { loadPyodide, type PyodideInterface } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import pkg from 'pyodide/package.json';
import { PYODIDE_VERSION } from '../src/runner/config';
import { advance, beginAction, buy, createWorld, openShop } from '../src/game/world';
import type { World } from '../src/game/types';

/**
 * Integration tests: real Python (Pyodide from node_modules, no network) running
 * real spells against the real game world. The `_shop` bridge here runs the
 * simulation synchronously instead of waiting for animations.
 */
let py: PyodideInterface;
let world: World;
let features: string[] = [];
let actions: { name: string; line: number }[] = [];
let actionLimit = Infinity;

beforeAll(async () => {
  py = await loadPyodide();
  py.registerJsModule('_shop', {
    loaded: (json: string) => void (features = JSON.parse(json)),
    action: (name: string, argsJson: string, line: number) => {
      actions.push({ name, line });
      if (actions.length > actionLimit) return JSON.stringify({ stop: true });
      const task = beginAction(world, name, JSON.parse(argsJson));
      if (task.error) return JSON.stringify({ error: task.error });
      for (let i = 0; i < 100_000 && !task.done; i++) advance(world, 0.05);
      return JSON.stringify({ value: task.result });
    },
  });
  py.runPython(readFileSync(new URL('../src/runner/harness.py', import.meta.url), 'utf8'));
}, 60_000);

function run(source: string, opts: { limit?: number; setup?: (w: World) => void } = {}) {
  world = createWorld(5);
  opts.setup?.(world);
  openShop(world);
  actions = [];
  features = [];
  actionLimit = opts.limit ?? Infinity;
  const runSpell = py.globals.get('run_spell');
  const outcome = JSON.parse(runSpell(source));
  runSpell.destroy();
  return outcome;
}

const spell = (...lines: string[]) => lines.join('\n') + '\n';

describe('python harness', () => {
  it('uses the same Pyodide version as the CDN config', () => {
    expect(pkg.version).toBe(PYODIDE_VERSION);
  });

  it('runs the starter spell and earns the first coins', () => {
    const out = run(spell('# comment', 'brew("health potion")', 'serve()'));
    expect(out).toEqual({ kind: 'finished' });
    expect(actions).toEqual([
      { name: 'brew', line: 2 },
      { name: 'serve', line: 3 },
    ]);
    expect(world.coins).toBeGreaterThan(0);
  });

  it('a while True loop keeps serving until stopped', () => {
    const out = run(spell('while True:', '    brew("health potion")', '    serve()'), { limit: 20 });
    expect(out).toEqual({ kind: 'stopped' });
    expect(world.stats.served).toBeGreaterThanOrEqual(9);
    expect(features).toEqual(['while']);
  });

  it('order() and if let the apprentice serve wizards', () => {
    const out = run(
      spell('while True:', '    if order() == "mana potion":', '        brew("mana potion")', '    else:', '        brew("health potion")', '    serve()'),
      {
        limit: 60,
        setup: (w) => {
          w.coins = 100;
          buy(w, 'page:repeat');
          buy(w, 'recipe:mana');
        },
      },
    );
    expect(out.kind).toBe('stopped');
    expect(world.stats.rejected).toBe(0);
    expect(world.stats.served).toBeGreaterThanOrEqual(15);
    expect(features).toEqual(['if', 'while']);
  });

  it('turns shop problems into ShopError with the line number', () => {
    const out = run(spell('brew("mana potion")'));
    expect(out).toMatchObject({ kind: 'error', errorType: 'ShopError', line: 1 });
    expect(out.message).toMatch(/haven't learned the mana potion recipe/);
    expect(out.traceback).not.toMatch(/harness|_act/);
  });

  it('reports syntax errors before running anything', () => {
    const out = run(spell('while True', '    serve()'));
    expect(out).toMatchObject({ kind: 'error', errorType: 'SyntaxError', line: 1 });
    expect(actions).toHaveLength(0);
  });

  it('reports runtime errors with the spell line', () => {
    const out = run(spell('brew("health potion")', 'sevre()'));
    expect(out).toMatchObject({ kind: 'error', errorType: 'NameError', line: 2 });
    expect(out.traceback).toContain('<your spell>');
  });

  it('print() makes the apprentice talk', () => {
    run(spell('print("Hello,", 2, "customers")'));
    expect(world.ledger.at(-1)!.text).toContain('Hello, 2 customers');
  });

  it('wrong argument counts give the usual TypeError', () => {
    expect(run(spell('brew()'))).toMatchObject({ errorType: 'TypeError' });
    expect(run(spell('serve("x")'))).toMatchObject({ errorType: 'TypeError' });
  });

  it('detects concepts for discovery bonuses', () => {
    run(spell('def go(p):', '    brew(p.lower().strip())', 'potions = [f"{1}"]', 'for p in ["health potion"]:', '    go(p)', 'd = {}'));
    expect(features).toEqual(['dict', 'for', 'fstring', 'helper', 'list', 'method', 'variable']);
  });
});
