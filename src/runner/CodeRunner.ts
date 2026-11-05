import type { CallResult, Json } from '../game/types';

/**
 * Language-agnostic boundary between the game and player code.
 * The game only ever sends and receives plain JSON data through this interface,
 * so another language (e.g. JavaScript) can be added by implementing it.
 */
export interface CodeRunner {
  readonly language: string;
  /** Start the runtime. Resolves once code can be run. */
  init(): Promise<void>;
  /** Load the player's code. Runs top-level statements and reports which concepts it uses. */
  setCode(source: string): Promise<SetCodeResult>;
  /** Call a function the player defined, e.g. call('serve', order). */
  call(fn: string, arg: Json, timeoutMs?: number): Promise<CallResult>;
  dispose(): void;
}

export type SetCodeResult =
  | { ok: true; features: string[]; stdout: string }
  | { ok: false; timeout?: false; errorType: string; message: string; line?: number; traceback: string; stdout: string }
  | { ok: false; timeout: true };

export interface RunnerEvents {
  /** Loading progress for the loading screen. */
  onStatus?(text: string): void;
  /** The runtime had to be restarted (e.g. after an infinite loop). */
  onRestart?(): void;
}

export const DEFAULT_CALL_TIMEOUT_MS = 1000;
