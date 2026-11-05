import type { ActionHost, CodeRunner, RunnerEvents, RunOutcome } from './CodeRunner';
import { CONTROL_BYTES, DATA_BYTES, type WorkerRequest, type WorkerResponse } from './protocol';

/** If Python hasn't stopped this long after Stop, the worker is replaced. */
const HARD_STOP_MS = 1500;

interface Session {
  worker: Worker;
  control: Int32Array;
  data: Uint8Array;
  interrupt: Uint8Array;
  ready: Promise<void>;
}

/**
 * Runs Python with Pyodide in a Web Worker. While a spell runs, each game
 * command blocks the worker (Atomics.wait) until the game has finished it.
 * Requires a cross-origin isolated page for SharedArrayBuffer.
 */
export class PythonRunner implements CodeRunner {
  readonly language = 'python';
  private session?: Session;
  private current?: { resolve(o: RunOutcome): void; host: ActionHost; hardStop?: ReturnType<typeof setTimeout> };
  private encoder = new TextEncoder();

  constructor(private events: RunnerEvents = {}) {}

  async init(): Promise<void> {
    if (!globalThis.crossOriginIsolated) {
      throw new Error('This page is not cross-origin isolated, so SharedArrayBuffer is unavailable.');
    }
    this.session = this.spawn(this.events.onStatus);
    await this.session.ready;
  }

  async run(source: string, host: ActionHost): Promise<RunOutcome> {
    const s = this.session;
    if (!s) throw new Error('PythonRunner.init() was not called');
    if (this.current) throw new Error('A spell is already running');
    await s.ready; // a replacement worker may still be loading
    return new Promise<RunOutcome>((resolve) => {
      this.current = { resolve, host };
      s.worker.postMessage({ type: 'run', source } satisfies WorkerRequest);
    });
  }

  stop(): void {
    const s = this.session;
    const cur = this.current;
    if (!s || !cur || cur.hardStop) return;
    // Interrupt Python if it's computing, and wake it if it's waiting on a command.
    s.interrupt[0] = 2;
    Atomics.store(s.control, 0, 2);
    Atomics.notify(s.control, 0);
    cur.hardStop = setTimeout(() => {
      // Still not stopped (stuck somewhere interrupts can't reach): replace the worker.
      if (this.current !== cur) return;
      s.worker.terminate();
      this.session = this.spawn();
      this.finish({ kind: 'stopped' });
    }, HARD_STOP_MS);
  }

  dispose(): void {
    this.session?.worker.terminate();
    this.session = undefined;
  }

  private finish(outcome: RunOutcome) {
    const cur = this.current;
    if (!cur) return;
    clearTimeout(cur.hardStop);
    this.current = undefined;
    cur.resolve(outcome);
  }

  private reply(s: Session, json: string) {
    const bytes = this.encoder.encode(json);
    s.data.set(bytes.subarray(0, DATA_BYTES));
    Atomics.store(s.control, 1, Math.min(bytes.length, DATA_BYTES));
    // Don't clobber a pending stop request.
    Atomics.compareExchange(s.control, 0, 0, 1);
    Atomics.notify(s.control, 0);
  }

  private spawn(onStatus?: (text: string) => void): Session {
    const worker = new Worker(new URL('./python.worker.ts', import.meta.url), { type: 'module' });
    const controlBuf = new SharedArrayBuffer(CONTROL_BYTES);
    const dataBuf = new SharedArrayBuffer(DATA_BYTES);
    const interruptBuf = new SharedArrayBuffer(1);
    let readyResolve!: () => void;
    let readyReject!: (e: Error) => void;
    const ready = new Promise<void>((res, rej) => ((readyResolve = res), (readyReject = rej)));
    const s: Session = {
      worker,
      control: new Int32Array(controlBuf),
      data: new Uint8Array(dataBuf),
      interrupt: new Uint8Array(interruptBuf),
      ready,
    };

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      if (this.session !== s) return; // a replaced worker
      const msg = e.data;
      switch (msg.type) {
        case 'status':
          onStatus?.(msg.text);
          break;
        case 'ready':
          readyResolve();
          break;
        case 'failed':
          readyReject(new Error(msg.error));
          this.finish({ kind: 'error', errorType: 'InternalError', message: msg.error, traceback: msg.error });
          break;
        case 'loaded':
          this.current?.host.loaded?.(msg.features);
          break;
        case 'action': {
          const cur = this.current;
          if (!cur) return this.reply(s, '{"stop":true}');
          cur.host.perform(msg.name, JSON.parse(msg.args), msg.line).then(
            (r) => this.reply(s, JSON.stringify(r)),
            (err) => this.reply(s, JSON.stringify({ error: String(err?.message ?? err) })),
          );
          break;
        }
        case 'done': {
          const o = JSON.parse(msg.outcome);
          this.finish(o.kind === 'error' ? { ...o, line: o.line ?? undefined } : o);
          break;
        }
      }
    };
    worker.onerror = (e) => readyReject(new Error(e.message || 'The Python worker crashed'));
    worker.postMessage({ type: 'init', control: controlBuf, data: dataBuf, interrupt: interruptBuf } satisfies WorkerRequest);
    return s;
  }
}
