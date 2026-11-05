import type { PageId, PotionId, ShopItemId, World } from './types';

// ---------------------------------------------------------------------------
// Timing (game seconds at 1× speed)
// ---------------------------------------------------------------------------
export const WALK_TIME = 0.6;
export const BREW_TIME = 2.0;
export const HANDOVER_TIME = 0.4;
export const READ_TIME = 0.3;
export const SAY_TIME = 0.4;
export const SHRUG_TIME = 0.4;

export const SPAWN_INTERVAL = 4.5;
export const FIRST_SPAWN = 3;
export const MAX_QUEUE = 4;
export const PATIENCE = 30;
/** Served correctly within this many seconds of reaching the counter, first try: +1 tip. */
export const QUICK_TIP_WINDOW = 10;
export const CAULDRON_FACTOR = 0.8;

// ---------------------------------------------------------------------------
// Potions & customers
// ---------------------------------------------------------------------------
export interface PotionDef {
  id: PotionId;
  price: number;
  color: string;
  /** Shop item that teaches the recipe (absent = known from the start). */
  recipe?: ShopItemId;
}

export const POTIONS: Record<PotionId, PotionDef> = {
  'health potion': { id: 'health potion', price: 3, color: '#c4483f' },
  'mana potion': { id: 'mana potion', price: 8, color: '#3d6fb8', recipe: 'recipe:mana' },
};

/** Share of customers wanting mana once the recipe is known. */
export const MANA_SHARE = 0.45;

export const CUSTOMER_NAMES = ['Pip', 'Rosa', 'Tobias', 'Wren', 'Hamish', 'Marigold', 'Bertie', 'Juniper', 'Fern', 'Alder', 'Clove', 'Sage'];
export const CUSTOMER_EMOJIS = ['🧑‍🌾', '👩‍🍳', '🧔', '👧', '👴', '🧑', '👵', '👨‍🦰', '👩‍🦱'];

export function knownPotions(w: World): PotionId[] {
  return (Object.values(POTIONS) as PotionDef[]).filter((p) => !p.recipe || w.owned.includes(p.recipe)).map((p) => p.id);
}

// ---------------------------------------------------------------------------
// The shop: things to buy
// ---------------------------------------------------------------------------
export interface ShopItem {
  id: ShopItemId;
  title: string;
  emoji: string;
  blurb: string;
  /** Cost for the next purchase (cauldron has levels). Undefined = sold out. */
  cost(w: World): number | undefined;
  /** Shown in the shop yet? */
  visible(w: World): boolean;
}

export const CAULDRON_COSTS = [15, 40, 100];

export const SHOP: ShopItem[] = [
  {
    id: 'page:repeat',
    title: 'Spellbook: Repeat',
    emoji: '🔁',
    blurb: 'Teach your apprentice to keep working without you pressing Run.',
    cost: (w) => (w.owned.includes('page:repeat') ? undefined : 10),
    visible: () => true,
  },
  {
    id: 'recipe:mana',
    title: 'Mana Potion Recipe',
    emoji: '💧',
    blurb: `Wizards will start visiting. They pay ${POTIONS['mana potion'].price} coins a potion!`,
    cost: (w) => (w.owned.includes('recipe:mana') ? undefined : 25),
    visible: (w) => w.owned.includes('page:repeat'),
  },
  {
    id: 'page:choices',
    title: 'Spellbook: Choices',
    emoji: '🔀',
    blurb: 'Read what each customer wants and brew the right thing.',
    cost: (w) => (w.owned.includes('page:choices') ? undefined : 10),
    visible: (w) => w.owned.includes('recipe:mana'),
  },
  {
    id: 'cauldron',
    title: 'Faster Cauldron',
    emoji: '🔥',
    blurb: 'Brew potions 20% faster.',
    cost: (w) => CAULDRON_COSTS[w.cauldronLevel],
    visible: (w) => w.lifetimeCoins >= 10,
  },
];

// ---------------------------------------------------------------------------
// Spellbook
// ---------------------------------------------------------------------------
export interface PageDef {
  id: PageId;
  title: string;
  /** Paragraphs separated by blank lines; `code` in backticks. */
  body: string;
  example: string;
}

export const PAGES: Record<PageId, PageDef> = {
  first: {
    id: 'first',
    title: 'Your First Spell',
    body:
      'Your apprentice follows your spell one line at a time, from top to bottom. Press Run and watch them go.\n\n' +
      '`brew("health potion")` walks to the cauldron and brews a potion. The words go in quotes so your apprentice knows they are a name, not a command.\n\n' +
      "`serve()` walks to the counter and hands over the potion you're holding. If nobody is there yet, your apprentice waits for the next customer.",
    example: 'brew("health potion")\nserve()',
  },
  repeat: {
    id: 'repeat',
    title: 'Repeat',
    body:
      '`while True:` repeats the lines underneath it forever, so your apprentice keeps working until you press Stop.\n\n' +
      'The lines to repeat must be indented: pushed in with 4 spaces. Mind the colon `:` at the end of the `while` line.\n\n' +
      'Your shop stays open as long as your spell is running.',
    example: 'while True:\n    brew("health potion")\n    serve()',
  },
  choices: {
    id: 'choices',
    title: 'Choices',
    body:
      '`order()` walks to the counter and tells you what the customer there wants, like `"mana potion"`.\n\n' +
      '`if` lets your apprentice decide. If the thing after `if` is true, the indented lines underneath run. Otherwise the lines under `else:` run.\n\n' +
      'Compare with `==` (two equals signs). One `=` stores a value; two `==` asks a question.',
    example: 'while True:\n    if order() == "mana potion":\n        brew("mana potion")\n    else:\n        brew("health potion")\n    serve()',
  },
};

export const PAGE_ORDER: PageId[] = ['first', 'repeat', 'choices'];

// ---------------------------------------------------------------------------
// Discoveries: rewarded the first time a concept appears in a spell that runs.
// ---------------------------------------------------------------------------
export const DISCOVERIES: Record<string, { label: string; bonus: number }> = {
  while: { label: 'a while loop', bonus: 5 },
  if: { label: 'an if statement', bonus: 10 },
  variable: { label: 'a variable', bonus: 5 },
  for: { label: 'a for loop', bonus: 10 },
  list: { label: 'a list', bonus: 5 },
  dict: { label: 'a dictionary', bonus: 10 },
  fstring: { label: 'an f-string', bonus: 5 },
  helper: { label: 'your own function', bonus: 10 },
  method: { label: 'a string method', bonus: 5 },
};

export const STARTER_CODE = '# Your apprentice follows these lines, top to bottom.\nbrew("health potion")\nserve()\n';
