import type { CallResult, Json } from '../game/types';
import { DEFAULT_CALL_TIMEOUT_MS, type CodeRunner, type RunnerEvents, type SetCodeResult } from './CodeRunner';
import type { WorkerRequest, WorkerResponse } from './python.worker';

const SET_CODE_TIMEOUT_MS = 2000;

type Pending = { resolve: (r: { result: string; stdout: string }) => void; reject: (e: Error) => void };

/** One Pyodide worker. Loading takes a few seconds, so we keep a warm spare. */
class PyWorker {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  readonly ready: Promise<void>;

  constructor(onStatus?: (text: string) => void) {
    this.worker = new Worker(new URL('./python.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === 'status') return onStatus?.(msg.text);
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.type === 'done') p.resolve({ result: msg.result, stdout: msg.stdout });
      else p.reject(new Error(msg.error));
    };
    this.worker.onerror = (e) => {
      for (const p of this.pending.values()) p.reject(new Error(e.message || 'Worker crashed'));
      this.pending.clear();
    };
    this.ready = this.send({ type: 'init' }).then(() => undefined);
  }

  send(req: DistributiveOmit<WorkerRequest, 'id'>): Promise<{ result: string; stdout: string }> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...req, id });
    });
  }

  terminate() {
    this.worker.terminate();
    for (const p of this.pending.values()) p.reject(new Error('terminated'));
    this.pending.clear();
  }
}

type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;

const TIMED_OUT = Symbol('timeout');

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    p.finally(() => clearTimeout(timer)),
    new Promise<typeof TIMED_OUT>((resolve) => (timer = setTimeout(() => resolve(TIMED_OUT), ms))),
  ]);
}

/**
 * Runs Python with Pyodide inside a Web Worker.
 * Requests are queued one at a time. If a call runs too long (an infinite loop),
 * the worker is terminated and a pre-warmed spare takes over with the same code.
 */
export class PythonRunner implements CodeRunner {
  readonly language = 'python';
  private active?: PyWorker;
  private spare?: PyWorker;
  private code?: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private events: RunnerEvents = {}) {}

  async init(): Promise<void> {
    this.active = new PyWorker(this.events.onStatus);
    await this.active.ready;
    this.spare = new PyWorker();
    this.spare.ready.catch(() => (this.spare = undefined));
  }

  setCode(source: string): Promise<SetCodeResult> {
    return this.enqueue(async () => {
      const res = await withTimeout(this.worker().then((w) => w.send({ type: 'setCode', source })), SET_CODE_TIMEOUT_MS);
      if (res === TIMED_OUT) {
        await this.restart(this.code); // keep the last spell that worked
        return { ok: false, timeout: true };
      }
      const parsed = JSON.parse(res.result);
      if (parsed.ok) this.code = source;
      return { ...parsed, line: parsed.line ?? undefined, stdout: res.stdout };
    });
  }

  call(fn: string, arg: Json, timeoutMs = DEFAULT_CALL_TIMEOUT_MS): Promise<CallResult> {
    return this.enqueue(async () => {
      const w = await this.worker();
      const res = await withTimeout(w.send({ type: 'call', fn, arg: JSON.stringify(arg) }), timeoutMs);
      if (res === TIMED_OUT) {
        await this.restart(this.code);
        return { kind: 'timeout' };
      }
      const parsed = JSON.parse(res.result);
      return parsed.kind === 'ok'
        ? { kind: 'ok', value: parsed.value, stdout: res.stdout }
        : { ...parsed, line: parsed.line ?? undefined, stdout: res.stdout };
    });
  }

  dispose(): void {
    this.active?.terminate();
    this.spare?.terminate();
    this.active = this.spare = undefined;
  }

  private async worker(): Promise<PyWorker> {
    if (!this.active) throw new Error('PythonRunner.init() was not called');
    await this.active.ready;
    return this.active;
  }

  /** Swap in the spare worker (or start a fresh one) and reload the last good code. */
  private async restart(code: string | undefined) {
    this.active?.terminate();
    this.active = this.spare ?? new PyWorker(this.events.onStatus);
    this.spare = undefined;
    this.events.onRestart?.();
    await this.active.ready;
    if (code !== undefined) await this.active.send({ type: 'setCode', source: code }).catch(() => undefined);
    this.spare = new PyWorker();
    this.spare.ready.catch(() => (this.spare = undefined));
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }
}
