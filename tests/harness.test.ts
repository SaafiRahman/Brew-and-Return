import { readFileSync } from 'node:fs';
import { loadPyodide, type PyodideInterface } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { PYODIDE_VERSION } from '../src/runner/config';
import pkg from 'pyodide/package.json';

/**
 * Integration tests for the Python harness, using the real Pyodide from
 * node_modules (no network). The browser loads the same version from the CDN.
 */
let py: PyodideInterface;
let setCode: (src: string) => any;
let call: (order: object) => any;

beforeAll(async () => {
  py = await loadPyodide();
  py.runPython(readFileSync(new URL('../src/runner/harness.py', import.meta.url), 'utf8'));
  const sc = py.globals.get('set_code');
  const cl = py.globals.get('call');
  setCode = (src) => JSON.parse(sc(src));
  call = (order) => JSON.parse(cl('serve', JSON.stringify(order)));
}, 60_000);

const spell = (...lines: string[]) => lines.join('\n') + '\n';

describe('python harness', () => {
  it('uses the same Pyodide version as the CDN config', () => {
    expect(pkg.version).toBe(PYODIDE_VERSION);
  });

  it('returns a string', () => {
    expect(setCode(spell('def serve(order):', '    return "health potion"'))).toEqual({ ok: true, features: [] });
    expect(call({ potion: 'health potion' })).toEqual({ kind: 'ok', value: 'health potion' });
  });

  it('reads order fields with a dot', () => {
    setCode(spell('def serve(order):', '    return order.potion'));
    expect(call({ potion: 'mana potion' }).value).toBe('mana potion');
  });

  it('reports the starter blank as a NameError on line 2', () => {
    expect(setCode(spell('def serve(order):', '    return ___')).ok).toBe(true);
    const r = call({ potion: 'health potion' });
    expect(r).toMatchObject({ kind: 'error', errorType: 'NameError', line: 2 });
    expect(r.traceback).toContain('<your spell>');
    expect(r.traceback).not.toContain('harness');
  });

  it('reports syntax errors with a line number', () => {
    const r = setCode(spell('def serve(order)', '    return "x"'));
    expect(r).toMatchObject({ ok: false, errorType: 'SyntaxError', line: 1 });
    expect(r.message).toMatch(/expected ':'/);
  });

  it('reports a missing serve function', () => {
    expect(setCode('x = 1\n')).toMatchObject({ ok: false, errorType: 'MissingServe' });
  });

  it('keeps the last good spell when a new one fails to load', () => {
    setCode(spell('def serve(order):', '    return "kept"'));
    setCode('def serve(order:\n');
    expect(call({}).value).toBe('kept');
  });

  it('explains missing attributes on the order', () => {
    setCode(spell('def serve(order):', '    return order.potion'));
    expect(call({ symptom: 'cough' })).toMatchObject({ errorType: 'AttributeError', message: "'Order' object has no attribute 'potion'" });
  });

  it('turns tuples into lists and None into null', () => {
    setCode(spell('def serve(order):', '    return (order.potion,) * order.quantity'));
    expect(call({ potion: 'luck potion', quantity: 2 }).value).toEqual(['luck potion', 'luck potion']);
    setCode(spell('def serve(order):', '    pass'));
    expect(call({}).value).toBeNull();
  });

  it('marks values that are not plain data', () => {
    setCode(spell('def serve(order):', '    return serve'));
    expect(call({}).value).toMatchObject({ __type__: 'function' });
  });

  it('keeps module-level state between calls', () => {
    setCode(spell('count = 0', 'def serve(order):', '    global count', '    count += 1', '    return count'));
    call({});
    expect(call({}).value).toBe(2);
  });

  it('detects concepts for discovery bonuses', () => {
    const r = setCode(
      spell(
        'recipes = {"cough": "honey potion"}',
        'def helper(x):',
        '    return x.lower().strip()',
        'def serve(order):',
        '    potions = []',
        '    for i in range(2):',
        '        if True:',
        '            potions.append(f"{order.potion}")',
        '    return potions',
      ),
    );
    expect(r.features).toEqual(['dict', 'for', 'fstring', 'helper', 'if', 'list', 'method', 'variable']);
  });
});
