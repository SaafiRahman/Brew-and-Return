import type { Json, KindId, Order, PageId, UpgradeId } from './types';

export const VILLAGER_POTIONS = ['health potion', 'mana potion', 'stamina potion', 'luck potion'] as const;

/** The healer's chalkboard: symptom → potion. The first three appear before the busy season. */
export const CHALKBOARD: Record<string, string> = {
  headache: 'calm potion',
  cough: 'honey potion',
  sleepy: 'energy potion',
  fever: 'frost potion',
  hiccups: 'hush potion',
  'sore feet': 'bounce potion',
  grumpy: 'giggle potion',
  sneezing: 'sniffle potion',
};
export const SMALL_SYMPTOMS = ['headache', 'cough', 'sleepy'];
export const ALL_SYMPTOMS = Object.keys(CHALKBOARD);
export const BUSY_SYMPTOMS = ALL_SYMPTOMS.filter((s) => !SMALL_SYMPTOMS.includes(s));

export interface KindDef {
  id: KindId;
  title: string;
  pay: number;
  names: string[];
  emojis: string[];
}

export const KINDS: Record<KindId, KindDef> = {
  first: { id: 'first', title: 'Villager', pay: 5, names: ['Old Maggie'], emojis: ['👵'] },
  villager: {
    id: 'villager',
    title: 'Villager',
    pay: 2,
    names: ['Pip', 'Rosa', 'Tobias', 'Wren', 'Hamish', 'Marigold', 'Bertie', 'Juniper'],
    emojis: ['🧑‍🌾', '👩‍🍳', '🧔', '👧', '👴', '🧑'],
  },
  healer: {
    id: 'healer',
    title: 'Healer',
    pay: 4,
    names: ['Sister Fern', 'Brother Alder', 'Nurse Clove', 'Healer Sage'],
    emojis: ['🧑‍⚕️', '👩‍⚕️', '👨‍⚕️'],
  },
  knight: {
    id: 'knight',
    title: 'Knight',
    pay: 3, // per potion
    names: ['Sir Reginald', 'Dame Bramble', 'Sir Pudding', 'Dame Thistle'],
    emojis: ['🛡️', '⚔️', '🏇'],
  },
};

export interface MadeOrder {
  order: Order;
  expected: Json;
  line: string;
}

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export function villagerOrder(potion: string): MadeOrder {
  return { order: { potion }, expected: potion, line: `${titleCase(potion)}, please!` };
}

const HEALER_LINES: Record<string, string> = {
  headache: 'A patient has a pounding headache.',
  cough: 'Someone in the ward has a terrible cough.',
  sleepy: "A patient can't keep their eyes open.",
  fever: 'A little one is burning up with fever!',
  hiccups: 'The miller has had hiccups since Tuesday. Hic!',
  'sore feet': 'The postman has sore feet again.',
  grumpy: 'The mayor is being very grumpy.',
  sneezing: "The baker can't stop sneezing into the bread.",
};

export function healerOrder(symptom: string): MadeOrder {
  return {
    order: { symptom },
    expected: CHALKBOARD[symptom],
    line: HEALER_LINES[symptom] ?? `Symptom: ${symptom}`,
  };
}

export function knightOrder(potion: string, quantity: number): MadeOrder {
  return {
    order: { potion, quantity },
    expected: Array.from({ length: quantity }, () => potion),
    line: `${quantity} × ${titleCase(potion)} for my squad! Huzzah!`,
  };
}

// ---------------------------------------------------------------------------
// Spellbook
// ---------------------------------------------------------------------------

export interface PageDef {
  id: PageId;
  title: string;
  cost: number;
  blurb: string;
  /** Short in-world explanation. Paragraphs separated by blank lines; `code` in backticks. */
  body: string;
  example: string;
}

export const PAGES: Record<PageId, PageDef> = {
  strings: {
    id: 'strings',
    title: 'Words & Returning',
    cost: 0,
    blurb: 'How to hand a potion to a customer.',
    body:
      'Words in Python are called strings. Wrap them in quotes so your apprentice knows it is text, not a spell: `"health potion"`.\n\n' +
      '`return` hands something back to the customer. Whatever comes after `return` is what they receive.\n\n' +
      'Each order has details you can read with a dot: `order.potion` is the potion the customer asked for.',
    example: 'def serve(order):\n    return order.potion',
  },
  conditionals: {
    id: 'conditionals',
    title: 'Conditionals',
    cost: 20,
    blurb: 'Make choices with if / elif / else.',
    body:
      '`if` lets your apprentice decide. If something is true, do one thing. `elif` means "else, if…" and checks the next thing. `else` catches everything left over.\n\n' +
      'Compare with `==` (two equals signs). One `=` stores a value; two `==` asks a question.\n\n' +
      'Mind the colon `:` at the end of each `if` line, and indent the lines that belong to it.',
    example:
      'def serve(order):\n    if order.symptom == "headache":\n        return "calm potion"\n    elif order.symptom == "cough":\n        return "honey potion"\n    else:\n        return "energy potion"',
  },
  dictionaries: {
    id: 'dictionaries',
    title: 'The Recipe Book',
    cost: 60,
    blurb: 'Dictionaries: look things up instead of checking one by one.',
    body:
      'A dictionary pairs keys with values, like a recipe book pairs symptoms with potions. Write it with curly braces: `{"key": "value", ...}`.\n\n' +
      'Look something up with square brackets: `recipes["fever"]` gives `"frost potion"`.\n\n' +
      'You can write the book once, above `serve`, and every customer can use it.',
    example:
      'recipes = {\n    "headache": "calm potion",\n    "cough": "honey potion",\n}\n\ndef serve(order):\n    return recipes[order.symptom]',
  },
  loops: {
    id: 'loops',
    title: 'Lists & Loops',
    cost: 120,
    blurb: 'Hand over many potions at once.',
    body:
      'A list holds several things in order: `["mana potion", "mana potion"]`. Start an empty one with `[]` and add to it with `.append(...)`.\n\n' +
      'A `for` loop repeats some lines. `for i in range(3):` runs the indented lines 3 times.\n\n' +
      'Put them together: start with an empty list, loop, append a potion each time, then return the list.',
    example:
      'def serve(order):\n    potions = []\n    for i in range(order.quantity):\n        potions.append(order.potion)\n    return potions',
  },
};

export const PAGE_ORDER: PageId[] = ['strings', 'conditionals', 'dictionaries', 'loops'];

// ---------------------------------------------------------------------------
// Shop upgrades
// ---------------------------------------------------------------------------

export const SIGN_FACTOR = 0.8;

export interface UpgradeDef {
  id: UpgradeId;
  title: string;
  emoji: string;
  costs: number[];
  describe(level: number): string;
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  sign: {
    id: 'sign',
    title: 'Shop Sign',
    emoji: '🪧',
    costs: [15, 50, 150],
    describe: (lvl) =>
      lvl === 0 ? 'Draws more foot traffic.' : `Customers arrive ${Math.round((1 / SIGN_FACTOR ** lvl - 1) * 100)}% more often.`,
  },
  tipjar: {
    id: 'tipjar',
    title: 'Tip Jar',
    emoji: '🫙',
    costs: [25, 80, 200],
    describe: (lvl) =>
      lvl === 0 ? 'Happy customers might leave a tip.' : `Happy customers tip more often, up to ${1 + lvl} coins.`,
  },
};

// ---------------------------------------------------------------------------
// Discoveries: rewarded the first time a concept shows up in the player's code.
// Feature names come from the code runner's analysis of the code.
// ---------------------------------------------------------------------------

export const DISCOVERIES: Record<string, { label: string; bonus: number }> = {
  variable: { label: 'a variable', bonus: 5 },
  if: { label: 'an if statement', bonus: 10 },
  dict: { label: 'a dictionary', bonus: 15 },
  list: { label: 'a list', bonus: 10 },
  for: { label: 'a for loop', bonus: 20 },
  while: { label: 'a while loop', bonus: 10 },
  fstring: { label: 'an f-string', bonus: 5 },
  helper: { label: 'a helper function', bonus: 15 },
  method: { label: 'a string method', bonus: 5 },
};

export const STARTER_CODE = 'def serve(order):\n    return ___\n';
