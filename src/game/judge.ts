import { explainError, explainWrong, normalize, TIMEOUT_HINT } from './hints';
import type { CallResult, Customer, Json, Verdict } from './types';

export interface Judgement {
  verdict: Verdict;
  got?: Json;
  hint?: string;
  traceback?: string;
  stdout?: string;
}

/** Compare what the player's code returned with what the customer wanted. */
export function judge(customer: Pick<Customer, 'kind' | 'order' | 'expected'>, result: CallResult): Judgement {
  if (result.kind === 'timeout') {
    return { verdict: 'timeout', hint: TIMEOUT_HINT };
  }
  if (result.kind === 'error') {
    return {
      verdict: 'error',
      hint: explainError(result, customer.order),
      traceback: result.traceback,
      stdout: result.stdout || undefined,
    };
  }
  const got = result.value;
  const stdout = result.stdout || undefined;
  if (deepEqual(normalize(got), normalize(customer.expected))) {
    return { verdict: 'correct', got, stdout };
  }
  return { verdict: 'wrong', got, hint: explainWrong(customer, got), stdout };
}

export function deepEqual(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => k in b && deepEqual(a[k], b[k]));
  }
  return false;
}
