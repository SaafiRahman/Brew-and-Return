/** Messages and shared-memory layout between PythonRunner and python.worker. */

/**
 * Shared memory used to block Python while the game carries out a command.
 * control[0]: 0 = waiting for the game, 1 = reply ready, 2 = stop requested
 * control[1]: byte length of the JSON reply in `data`
 */
export const CONTROL_BYTES = 8;
export const DATA_BYTES = 64 * 1024;

export type WorkerRequest =
  | { type: 'init'; control: SharedArrayBuffer; data: SharedArrayBuffer; interrupt: SharedArrayBuffer }
  | { type: 'run'; source: string };

export type WorkerResponse =
  | { type: 'status'; text: string }
  | { type: 'ready' }
  | { type: 'failed'; error: string }
  | { type: 'loaded'; features: string[] }
  | { type: 'action'; name: string; args: string; line: number }
  | { type: 'done'; outcome: string };
