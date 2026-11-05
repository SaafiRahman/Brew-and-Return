import type { Json } from '../game/types';

/**
 * Language-agnostic boundary between the game and player code.
 * A spell runs top to bottom; each game command it calls (brew, serve, order…)
 * is handed to the host, and the spell waits until the host has finished it.
 * Only plain JSON crosses this boundary, so other languages can be added later.
 */
export interface CodeRunner {
  readonly language: string;
  init(): Promise<void>;
  /** Run a spell to completion (or until stopped). */
  run(source: string, host: ActionHost): Promise<RunOutcome>;
  /** Ask a running spell to stop. The pending run() resolves with `stopped`. */
  stop(): void;
  dispose(): void;
}

export interface ActionHost {
  /** The spell parsed fine; these concepts appear in it (for discovery bonuses). */
  loaded?(features: string[]): void;
  /** Carry out a game command. Resolve with its result, or reject the command with an error message. */
  perform(action: string, args: Json[], line: number): Promise<ActionReply>;
}

export type ActionReply = { value: Json } | { error: string };

export type RunOutcome =
  | { kind: 'finished' }
  | { kind: 'stopped' }
  | { kind: 'error'; errorType: string; message: string; line?: number; traceback: string };

export interface RunnerEvents {
  onStatus?(text: string): void;
}
