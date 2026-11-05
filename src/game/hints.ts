/**
 * Turns Python errors into kind, in-world, plain-English hints.
 * Pure functions: no DOM, no runner. Hints may contain `code` in backticks.
 */

export interface ErrorInfo {
  errorType: string;
  message: string;
  line?: number;
}

const POTION_IDS = ['health', 'mana'];
const COMMANDS = ['brew', 'serve', 'order'];

const onLine = (line?: number) => (line ? ` on line ${line}` : '');

export function explainError(err: ErrorInfo): string {
  const { errorType, message, line } = err;

  // Problems the shop itself reports (wrong potion name, unknown recipe…) are already friendly.
  if (errorType === 'ShopError') return message + (line ? ` (line ${line})` : '');

  if (errorType === 'SyntaxError' || errorType === 'IndentationError' || errorType === 'TabError') {
    return explainSyntax(errorType, message, line);
  }

  if (errorType === 'NameError') {
    const name = /name '([^']+)' is not defined/.exec(message)?.[1];
    if (name === '___') return `Fill in the blank \`___\`${onLine(line)}.`;
    if (name === 'true' || name === 'false') {
      return `Python spells it with a capital letter: \`${name[0].toUpperCase() + name.slice(1)}\`${onLine(line)}.`;
    }
    if (name?.toLowerCase() === 'potion' || name?.toLowerCase() === 'potions') {
      return `Did you mean \`Potion\`${onLine(line)}? It starts with a capital P.`;
    }
    if (name && POTION_IDS.includes(name.toLowerCase())) {
      return `Did you mean \`Potion.${name.toLowerCase()}\`${onLine(line)}? Potions live in the Potion list.`;
    }
    if (name) {
      const close = COMMANDS.find((c) => similar(c, name));
      if (close) return `Your apprentice doesn't know \`${name}\`${onLine(line)}. Did you mean \`${close}\`?`;
      return `Your apprentice doesn't know what \`${name}\` is${onLine(line)}. Check the spelling, or give it a value before using it.`;
    }
  }

  if (errorType === 'TypeError') {
    const takes = /(\w+)\(\) (missing|takes)/.exec(message);
    if (takes?.[1] === 'brew') return `\`brew\` needs to know which potion${onLine(line)}, like \`brew(Potion.health)\`.`;
    if (takes && (takes[1] === 'serve' || takes[1] === 'order')) {
      return `\`${takes[1]}()\` doesn't need anything in its brackets${onLine(line)}.`;
    }
    if (/can only concatenate str|unsupported operand type/.test(message)) {
      return `Your apprentice tried to mix words and numbers${onLine(line)}. They don't stir together!`;
    }
    if (/'(\w+)' object is not callable/.test(message)) {
      return `Something that isn't a command got called like one${onLine(line)}. Check for extra brackets \`()\`.`;
    }
  }

  if (errorType === 'AttributeError') {
    const m = /'(\w+)' object has no attribute '([^']+)'/.exec(message);
    if (m) return `That doesn't have a \`.${m[2]}\`${onLine(line)}. Check the spelling?`;
  }
  if (errorType === 'KeyError') return `Your dictionary has no entry for ${message}${onLine(line)}.`;
  if (errorType === 'ZeroDivisionError') return `Dividing by zero made the cauldron fizzle${onLine(line)}.`;
  if (errorType === 'RecursionError') return 'A command kept calling itself forever and your apprentice got dizzy.';
  if (errorType === 'IndexError') return `Your apprentice reached for an item past the end of a list${onLine(line)}.`;

  return `Something went wrong in your spell${onLine(line)}: ${errorType}: ${message}`;
}

function explainSyntax(errorType: string, message: string, line?: number): string {
  const where = line ? `line ${line}` : 'your spell';
  if (/unterminated string|EOL while scanning/.test(message)) return `A name on ${where} is missing its closing quote \`"\`.`;
  if (/expected ':'/.test(message)) return `${cap(where)} needs a colon \`:\` at the end.`;
  if (/Maybe you meant '==' /.test(message)) {
    return `To compare things on ${where}, use \`==\` (two equals signs). One \`=\` stores a value.`;
  }
  if (/expected an indented block/.test(message)) {
    return `The lines after a \`:\` need to be indented (pushed in with 4 spaces). Check ${where}.`;
  }
  if (/unexpected indent|unindent does not match|inconsistent use of tabs/.test(message) || errorType !== 'SyntaxError') {
    return `${cap(where)} is indented oddly. Line its spaces up with the lines around it.`;
  }
  if (/was never closed|unmatched|closing parenthesis|does not match opening/.test(message)) {
    return `A bracket on ${where} isn't matched. Every \`(\` needs a \`)\`.`;
  }
  return `Your apprentice can't read ${where} of the spell scroll. Look for typos, missing quotes or brackets.`;
}

export const STUCK_HINT =
  'Your apprentice got stuck thinking in circles and fell asleep! 💤 Is there a loop that never brews, serves or reads an order?';

/** Rough "did you mean": the same word with at most one letter added, removed or changed. */
export function similar(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return true;
  // Two neighbouring letters swapped ("sevre" for "serve").
  if (x.length === y.length) {
    const diffs = [...x].map((c, k) => (c !== y[k] ? k : -1)).filter((k) => k >= 0);
    if (diffs.length === 2 && diffs[1] === diffs[0] + 1 && x[diffs[0]] === y[diffs[1]] && x[diffs[1]] === y[diffs[0]]) return true;
  }
  if (Math.abs(x.length - y.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (x.length > y.length) i++;
    else if (y.length > x.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (x.length - i) + (y.length - j) <= 1;
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
