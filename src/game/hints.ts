import type { Customer, Json, Order } from './types';

/**
 * Turns Python errors and wrong answers into kind, in-world, plain-English hints.
 * Pure functions: no DOM, no runner. Hints may contain `code` in backticks.
 */

export interface ErrorInfo {
  errorType: string;
  message: string;
  line?: number;
}

const POTION_WORDS = ['health', 'mana', 'stamina', 'luck', 'potion', 'calm', 'honey', 'energy', 'frost', 'hush', 'bounce', 'giggle', 'sniffle'];

const onLine = (line?: number) => (line ? ` on line ${line}` : '');

export function explainError(err: ErrorInfo, order?: Order): string {
  const { errorType, message, line } = err;

  if (errorType === 'MissingServe') {
    return "Your apprentice couldn't find a `serve` function. Keep the line `def serve(order):` at the top of your spell.";
  }

  if (errorType === 'SyntaxError' || errorType === 'IndentationError' || errorType === 'TabError') {
    return explainSyntax(errorType, message, line);
  }

  if (errorType === 'NameError') {
    const name = /name '([^']+)' is not defined/.exec(message)?.[1];
    if (name === '___') {
      return 'Replace the blank `___` with the potion\'s name in quotes, like `"health potion"`.';
    }
    if (name && POTION_WORDS.includes(name.toLowerCase())) {
      return `Your apprentice doesn't know a spell called \`${name}\`. If you meant words, wrap them in quotes, like \`"${name} potion"\`.`;
    }
    if (name) {
      return `Your apprentice doesn't know what \`${name}\` is${onLine(line)}. Check the spelling, or give it a value before using it.`;
    }
  }

  if (errorType === 'AttributeError') {
    const m = /'Order' object has no attribute '([^']+)'/.exec(message);
    if (m) {
      const fields = Object.keys(order ?? {}).map((f) => `\`order.${f}\``);
      const has = fields.length ? ` This one has ${fields.join(' and ')}.` : '';
      return `This order doesn't have a \`.${m[1]}\`.${has}`;
    }
    const method = /'(\w+)' object has no attribute '([^']+)'/.exec(message);
    if (method) {
      return `A ${friendlyType(method[1])} doesn't know how to \`.${method[2]}\`${onLine(line)}. Check the spelling?`;
    }
  }

  if (errorType === 'KeyError') {
    const key = message.replace(/^['"]|['"]$/g, '');
    return `Your recipe book has no entry for "${key}". Add it to your dictionary!`;
  }

  if (errorType === 'TypeError') {
    if (/serve\(\) (missing|takes)/.test(message)) {
      return '`serve` needs exactly one input in its brackets: `def serve(order):`.';
    }
    if (/can only concatenate str|unsupported operand type/.test(message)) {
      return `Your apprentice tried to mix words and numbers${onLine(line)}. They don't stir together!`;
    }
    if (/'(\w+)' object is not callable/.test(message)) {
      return `Something that isn't a spell got called like one${onLine(line)}. Check for extra brackets \`()\`.`;
    }
    if (/object cannot be interpreted as an integer|must be integers/.test(message)) {
      return `Your apprentice needed a whole number${onLine(line)} but got something else.`;
    }
  }

  if (errorType === 'ZeroDivisionError') {
    return `Dividing by zero made the cauldron fizzle${onLine(line)}.`;
  }
  if (errorType === 'RecursionError') {
    return 'Your spell kept calling itself forever and your apprentice got dizzy. Does a function call itself?';
  }
  if (errorType === 'IndexError') {
    return `Your apprentice reached for an item past the end of a list${onLine(line)}.`;
  }

  return `Something went wrong in your spell${onLine(line)}: ${errorType}: ${message}`;
}

function explainSyntax(errorType: string, message: string, line?: number): string {
  const where = line ? `line ${line}` : 'your spell';
  if (/unterminated string|EOL while scanning/.test(message)) {
    return `A string on ${where} is missing its closing quote \`"\`.`;
  }
  if (/expected ':'/.test(message)) {
    return `${cap(where)} needs a colon \`:\` at the end.`;
  }
  if (/Maybe you meant '==' /.test(message)) {
    return `To compare things on ${where}, use \`==\` (two equals signs). One \`=\` stores a value.`;
  }
  if (/'return' outside function/.test(message)) {
    return `\`return\` only works inside \`serve\`. Indent ${where} so it sits under \`def serve(order):\`.`;
  }
  if (/expected an indented block/.test(message)) {
    return `The lines after a \`:\` need to be indented (pushed in with spaces). Check ${where}.`;
  }
  if (/unexpected indent|unindent does not match|inconsistent use of tabs/.test(message) || errorType !== 'SyntaxError') {
    return `${cap(where)} is indented oddly. Line its spaces up with the lines around it.`;
  }
  if (/was never closed|unmatched|closing parenthesis/.test(message)) {
    return `A bracket on ${where} isn't matched. Every \`(\`, \`[\` and \`{\` needs a partner.`;
  }
  return `Your apprentice can't read ${where} of the spell scroll. Look for typos, missing quotes or brackets.`;
}

export const TIMEOUT_HINT =
  'Your apprentice got stuck in a loop and fell asleep! 💤 Check for a loop that never ends.';

/** Explain why a returned value didn't satisfy the customer. */
export function explainWrong(customer: Pick<Customer, 'kind' | 'order' | 'expected'>, got: Json): string {
  const { expected, order } = customer;

  if (got === null) {
    const base = 'Your apprentice stood there holding nothing. Did you forget to `return` something?';
    if (order.symptom !== undefined && order.potion === undefined) {
      return `${base} This customer didn't name a potion, so \`order.potion\` is empty. They told you \`order.symptom\` instead.`;
    }
    return base;
  }
  if (isUnserializable(got)) {
    return `Your apprentice tried to hand over ${article(friendlyType(got.__type__ as string))}. Customers only accept potions: text in quotes, like \`"health potion"\`.`;
  }

  if (Array.isArray(expected)) {
    const want = expected.length;
    const potion = expected[0];
    if (!Array.isArray(got)) {
      return `The knight wanted ${want} potions but got just one thing. Try handing over a list, like \`["${potion}", "${potion}"]\`.`;
    }
    if (got.length !== want) {
      return `The knight counted ${got.length} potion${got.length === 1 ? '' : 's'} but wanted ${want}. Check how many times your loop runs.`;
    }
    return `Some potions in the list weren't right. The knight wanted ${want} × "${potion}".`;
  }

  if (typeof got === 'string') {
    const g = normalize(got);
    if (order.symptom && g === normalize(order.symptom)) {
      return `You handed over the word "${got}". That's the symptom! Check the chalkboard for the potion that cures it.`;
    }
    let hint = `They wanted "${expected}" but got "${got}".`;
    if (order.potion && !order.symptom && customer.kind !== 'first') {
      hint += ' Every order is different. `order.potion` holds the potion this customer asked for.';
    }
    if (order.symptom) {
      hint += ' Check the chalkboard: which potion cures this symptom?';
    }
    return hint;
  }
  if (Array.isArray(got)) {
    return `They only wanted one potion, but got a whole list.`;
  }
  return `They wanted "${expected}" but got ${typeof got === 'number' ? 'the number ' : ''}${JSON.stringify(got)}. Potion names go in quotes.`;
}

export function normalize(value: Json): Json {
  if (typeof value === 'string') return value.trim().toLowerCase().replace(/\s+/g, ' ');
  if (Array.isArray(value)) return value.map(normalize);
  return value;
}

/** The runner marks values that can't become plain data (functions, objects…) this way. */
export function isUnserializable(v: Json): v is { __type__: string; __repr__: string } {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && typeof v.__type__ === 'string';
}

function friendlyType(t: string): string {
  const map: Record<string, string> = {
    function: 'spell (a function)',
    str: 'string',
    int: 'number',
    float: 'number',
    list: 'list',
    dict: 'dictionary',
    NoneType: 'nothing',
    Order: 'order slip',
    type: 'type',
    set: 'set',
  };
  return map[t] ?? t;
}

const article = (s: string) => (/^[aeiou]/i.test(s) ? `an ${s}` : `a ${s}`);
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
