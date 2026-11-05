/// <reference lib="webworker" />
import type { PyodideInterface } from 'pyodide';
import HARNESS from './harness.py?raw';
import { PYODIDE_INDEX_URL } from './config';

/** Messages from the main thread. */
export type WorkerRequest =
  | { id: number; type: 'init' }
  | { id: number; type: 'setCode'; source: string }
  | { id: number; type: 'call'; fn: string; arg: string };

/** Messages to the main thread. `result` is a JSON string from the harness. */
export type WorkerResponse =
  | { id: number; type: 'done'; result: string; stdout: string }
  | { id: number; type: 'failed'; error: string }
  | { type: 'status'; text: string };

const MAX_STDOUT = 2000;

let pyodide: PyodideInterface | undefined;
let setCode: ((source: string) => string) | undefined;
let callFn: ((fn: string, arg: string) => string) | undefined;
let stdout: string[] = [];

const post = (msg: WorkerResponse) => (self as DedicatedWorkerGlobalScope).postMessage(msg);

async function init() {
  post({ type: 'status', text: 'Fetching the cauldron…' });
  const { loadPyodide } = (await import(/* @vite-ignore */ `${PYODIDE_INDEX_URL}pyodide.mjs`)) as typeof import('pyodide');
  post({ type: 'status', text: 'Warming up the cauldron…' });
  pyodide = await loadPyodide({ indexURL: PYODIDE_INDEX_URL });
  const collect = (line: string) => {
    if (stdout.join('\n').length < MAX_STDOUT) stdout.push(line);
  };
  pyodide.setStdout({ batched: collect });
  pyodide.setStderr({ batched: collect });
  pyodide.runPython(HARNESS);
  setCode = pyodide.globals.get('set_code');
  callFn = pyodide.globals.get('call');
  post({ type: 'status', text: 'Ready!' });
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  stdout = [];
  try {
    let result = '';
    if (req.type === 'init') {
      await init();
      result = '{}';
    } else if (req.type === 'setCode') {
      result = setCode!(req.source);
    } else {
      result = callFn!(req.fn, req.arg);
    }
    const out = stdout.join('\n');
    post({ id: req.id, type: 'done', result, stdout: out.length > MAX_STDOUT ? out.slice(0, MAX_STDOUT) + '…' : out });
  } catch (err) {
    post({ id: req.id, type: 'failed', error: String(err) });
  }
};
