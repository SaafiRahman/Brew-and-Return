/// <reference lib="webworker" />
import type { PyodideInterface } from 'pyodide';
import HARNESS from './harness.py?raw';
import { PYODIDE_INDEX_URL } from './config';
import type { WorkerRequest, WorkerResponse } from './protocol';

let pyodide: PyodideInterface | undefined;
let control: Int32Array;
let data: Uint8Array;
let interrupt: Uint8Array;
const decoder = new TextDecoder();

const post = (msg: WorkerResponse) => (self as DedicatedWorkerGlobalScope).postMessage(msg);

/** Called synchronously from Python: hand the command to the game and block until it replies. */
function action(name: string, args: string, line: number): string {
  if (Atomics.load(control, 0) === 2) return '{"stop":true}';
  Atomics.store(control, 0, 0);
  post({ type: 'action', name, args, line });
  Atomics.wait(control, 0, 0);
  if (Atomics.load(control, 0) === 2) return '{"stop":true}';
  const len = Atomics.load(control, 1);
  return decoder.decode(data.slice(0, len));
}

async function init(msg: Extract<WorkerRequest, { type: 'init' }>) {
  control = new Int32Array(msg.control);
  data = new Uint8Array(msg.data);
  interrupt = new Uint8Array(msg.interrupt);
  post({ type: 'status', text: 'Fetching the cauldron…' });
  const { loadPyodide } = (await import(/* @vite-ignore */ `${PYODIDE_INDEX_URL}pyodide.mjs`)) as typeof import('pyodide');
  post({ type: 'status', text: 'Warming up the cauldron…' });
  pyodide = await loadPyodide({ indexURL: PYODIDE_INDEX_URL });
  pyodide.setInterruptBuffer(interrupt);
  pyodide.registerJsModule('_shop', {
    action,
    loaded: (features: string) => post({ type: 'loaded', features: JSON.parse(features) }),
  });
  pyodide.runPython(HARNESS);
  post({ type: 'ready' });
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  try {
    if (msg.type === 'init') {
      await init(msg);
    } else {
      Atomics.store(control, 0, 0);
      interrupt[0] = 0;
      const runSpell = pyodide!.globals.get('run_spell');
      const outcome: string = runSpell(msg.source);
      runSpell.destroy();
      post({ type: 'done', outcome });
    }
  } catch (err) {
    post({ type: 'failed', error: String(err) });
  }
};
