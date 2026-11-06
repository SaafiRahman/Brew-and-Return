import type { CustomerKind, PageId, PotionId, ShopItemId, World } from './types';

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
/** Extra patience per potion beyond the first (knights' big orders take longer). */
export const PATIENCE_PER_EXTRA = 10;
/** Served correctly within this many seconds of reaching the counter, first try: a tip. */
export const QUICK_TIP_WINDOW = 10;
export const QUICK_TIP_PER_EXTRA = 4;
export const CAULDRON_FACTOR = 0.8;
/** The basket the Knight's Contract comes with. */
export const BASKET_SIZE = 3;
/** Healers add a fee for the advice on top of the potion's price. */
export const HEALER_FEE = 3;
/** Knights pay this much more for a big order delivered all at once. */
export const KNIGHT_BONUS = 1.5;

// ---------------------------------------------------------------------------
// Potions
// ---------------------------------------------------------------------------
export interface PotionDef {
  id: PotionId;
  price: number;
  color: string;
  /** Shop item that teaches the recipe (absent = known from the start). */
  recipe?: ShopItemId;
}

export const POTIONS: Record<PotionId, PotionDef> = {
  health: { id: 'health', price: 3, color: '#c4483f' },
  mana: { id: 'mana', price: 8, color: '#3d6fb8', recipe: 'recipe:mana' },
  cooling: { id: 'cooling', price: 5, color: '#3fa7a0', recipe: 'recipe:healer' },
  sleep: { id: 'sleep', price: 5, color: '#8a5bb5', recipe: 'recipe:healer' },
};

/** What customers call it: "health potion". In code it's written `Potion.health`. */
export const potionName = (id: PotionId) => `${id} potion`;
/** How the player writes it in a spell. */
export const potionCode = (id: PotionId) => `Potion.${id}`;

export function knownPotions(w: World): PotionId[] {
  return (Object.values(POTIONS) as PotionDef[]).filter((p) => !p.recipe || w.owned.includes(p.recipe)).map((p) => p.id);
}

// ---------------------------------------------------------------------------
// Ailments: healers say these instead of naming a potion. The chalkboard
// (bought with the Healer's Chalkboard) shows which potion cures which.
// ---------------------------------------------------------------------------
export interface AilmentDef {
  name: string;
  emoji: string;
  cure: PotionId;
  /** Only once the Healer's Almanac brings more patients. */
  almanac?: boolean;
}

export const AILMENTS: AilmentDef[] = [
  { name: 'fever', emoji: '🤒', cure: 'cooling' },
  { name: 'sleepless', emoji: '🥱', cure: 'sleep' },
  { name: 'scraped knee', emoji: '🤕', cure: 'health' },
  { name: 'sunburn', emoji: '🥵', cure: 'cooling', almanac: true },
  { name: 'nightmares', emoji: '😨', cure: 'sleep', almanac: true },
  { name: 'bruise', emoji: '😣', cure: 'health', almanac: true },
];

export function knownAilments(w: World): AilmentDef[] {
  if (!w.owned.includes('recipe:healer')) return [];
  return AILMENTS.filter((a) => !a.almanac || w.owned.includes('almanac'));
}

export const ailment = (name: string) => AILMENTS.find((a) => a.name === name);

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
export interface CustomerDef {
  kind: CustomerKind;
  emojis: string[];
  /** Relative chance of visiting (0 = not yet). */
  weight(w: World): number;
}

export const CUSTOMERS: CustomerDef[] = [
  { kind: 'villager', emojis: ['🧑‍🌾', '👩‍🍳', '🧔', '👧', '👴', '🧑', '👵', '👨‍🦰', '👩‍🦱'], weight: () => 1 },
  { kind: 'wizard', emojis: ['🧝', '🧝‍♀️', '🧝‍♂️'], weight: (w) => (w.owned.includes('recipe:mana') ? 0.8 : 0) },
  {
    kind: 'healer',
    emojis: ['🧑‍⚕️', '👩‍⚕️', '👨‍⚕️'],
    weight: (w) => (!w.owned.includes('recipe:healer') ? 0 : w.owned.includes('almanac') ? 1.6 : 1),
  },
  { kind: 'knight', emojis: ['💂', '💂‍♀️', '🤺'], weight: (w) => (w.owned.includes('contract:knight') ? 0.9 : 0) },
];

export const CUSTOMER_NAMES = ['Pip', 'Rosa', 'Tobias', 'Wren', 'Hamish', 'Marigold', 'Bertie', 'Juniper', 'Fern', 'Alder', 'Clove', 'Sage'];

/** Potions a knight may order (they don't need cures). */
export const KNIGHT_POTIONS: PotionId[] = ['health', 'mana'];

// ---------------------------------------------------------------------------
// The shop: things to buy
// ---------------------------------------------------------------------------
export interface ShopItem {
  id: ShopItemId;
  title: string;
  emoji: string;
  blurb: string;
  /** Cost for the next purchase (upgrades have levels). Undefined = sold out. */
  cost(w: World): number | undefined;
  /** Shown in the shop yet? */
  visible(w: World): boolean;
}

export const CAULDRON_COSTS = [15, 40, 100];
export const TIPJAR_COSTS = [25, 60];

const once = (id: ShopItemId, price: number) => (w: World) => (w.owned.includes(id) ? undefined : price);
const after = (id: ShopItemId) => (w: World) => w.owned.includes(id);

export const SHOP: ShopItem[] = [
  {
    id: 'page:repeat',
    title: 'Spellbook: Repeat',
    emoji: '🔁',
    blurb: 'Teach your apprentice to keep working without you pressing Run.',
    cost: once('page:repeat', 10),
    visible: () => true,
  },
  {
    id: 'recipe:mana',
    title: 'Mana Potion Recipe',
    emoji: '💧',
    blurb: `Adds Potion.mana. Wizards will start visiting, and they pay ${POTIONS.mana.price} coins a potion!`,
    cost: once('recipe:mana', 25),
    visible: after('page:repeat'),
  },
  {
    id: 'page:choices',
    title: 'Spellbook: Choices',
    emoji: '🔀',
    blurb: 'Read what each customer wants and brew the right thing.',
    cost: once('page:choices', 10),
    visible: after('recipe:mana'),
  },
  {
    id: 'recipe:healer',
    title: "Healer's Chalkboard",
    emoji: '🩺',
    blurb: `Adds Potion.cooling and Potion.sleep. Healers will visit about their patients, and pay ${HEALER_FEE} coins extra for your advice.`,
    cost: once('recipe:healer', 40),
    visible: after('page:choices'),
  },
  {
    id: 'page:remedies',
    title: 'Spellbook: Remedies',
    emoji: '📝',
    blurb: 'Remember what a customer said, and pick from many choices.',
    cost: once('page:remedies', 15),
    visible: after('recipe:healer'),
  },
  {
    id: 'almanac',
    title: "Healer's Almanac",
    emoji: '📗',
    blurb: 'Three more ailments go up on the chalkboard, and healers visit much more often.',
    cost: once('almanac', 35),
    visible: after('page:remedies'),
  },
  {
    id: 'page:recipes',
    title: 'Spellbook: Recipe Book',
    emoji: '📚',
    blurb: 'Swap a long chain of elifs for a book that looks things up for you.',
    cost: once('page:recipes', 20),
    visible: after('almanac'),
  },
  {
    id: 'contract:knight',
    title: "Knight's Contract",
    emoji: '🛡️',
    blurb: `Knights will order several potions at once and pay ${KNIGHT_BONUS}× for them. Comes with a basket that holds ${BASKET_SIZE} potions.`,
    cost: once('contract:knight', 70),
    visible: after('page:recipes'),
  },
  {
    id: 'page:loops',
    title: 'Spellbook: Lists & Loops',
    emoji: '🧺',
    blurb: 'Brew every potion on a list, one after another.',
    cost: once('page:loops', 20),
    visible: after('contract:knight'),
  },
  {
    id: 'cauldron',
    title: 'Faster Cauldron',
    emoji: '🔥',
    blurb: 'Brew potions 20% faster.',
    cost: (w) => CAULDRON_COSTS[w.cauldronLevel],
    visible: (w) => w.lifetimeCoins >= 10,
  },
  {
    id: 'tipjar',
    title: 'Tip Jar',
    emoji: '🫙',
    blurb: 'Customers served quickly, on the first try, tip 1 coin more.',
    cost: (w) => TIPJAR_COSTS[w.tipJarLevel],
    visible: (w) => w.lifetimeCoins >= 40,
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

const RECIPE_BOOK = `remedies = {
    "fever": Potion.cooling,
    "sunburn": Potion.cooling,
    "sleepless": Potion.sleep,
    "nightmares": Potion.sleep,
    "scraped knee": Potion.health,
    "bruise": Potion.health,
}
`;

export const PAGES: Record<PageId, PageDef> = {
  first: {
    id: 'first',
    title: 'Your First Spell',
    body:
      'Your apprentice follows your spell one line at a time, from top to bottom. Press Run and watch them go.\n\n' +
      '`brew(Potion.health)` walks to the cauldron and brews a health potion. `Potion.health` means "the health potion from the Potion list". Type `Potion.` in your spell to see every potion you know.\n\n' +
      "`serve()` walks to the counter and hands over the potion you're holding. If nobody is there yet, your apprentice waits for the next customer.",
    example: 'brew(Potion.health)\nserve()',
  },
  repeat: {
    id: 'repeat',
    title: 'Repeat',
    body:
      '`while True:` repeats the lines underneath it forever, so your apprentice keeps working until you press Stop.\n\n' +
      'The lines to repeat must be indented: pushed in with 4 spaces. Mind the colon `:` at the end of the `while` line.\n\n' +
      'Your shop stays open as long as your spell is running.',
    example: 'while True:\n    brew(Potion.health)\n    serve()',
  },
  choices: {
    id: 'choices',
    title: 'Choices',
    body:
      '`order()` walks to the counter and tells you which potion the customer there wants, like `Potion.mana`.\n\n' +
      '`if` lets your apprentice decide. If the thing after `if` is true, the indented lines underneath run. Otherwise the lines under `else:` run.\n\n' +
      'Compare with `==` (two equals signs). One `=` stores a value; two `==` asks a question.',
    example: 'while True:\n    if order() == Potion.mana:\n        brew(Potion.mana)\n    else:\n        brew(Potion.health)\n    serve()',
  },
  remedies: {
    id: 'remedies',
    title: 'Remedies',
    body:
      "Healers don't name a potion. For them, `order()` gives their patient's ailment: words in quotes, like `\"fever\"`. Words in quotes are called strings. The chalkboard under your shop says which potion cures what.\n\n" +
      '`wanted = order()` stores the answer in a variable called `wanted`, so you can check it as often as you like.\n\n' +
      '`elif` means "else if". It is only checked when everything above it was false, and you can have as many as you need. The `else:` at the bottom catches everyone else, like villagers and wizards: `brew(wanted)` brews exactly the potion they asked for.',
    example:
      'while True:\n    wanted = order()\n    if wanted == "fever":\n        brew(Potion.cooling)\n    elif wanted == "sleepless":\n        brew(Potion.sleep)\n    elif wanted == "scraped knee":\n        brew(Potion.health)\n    else:\n        brew(wanted)\n    serve()',
  },
  recipes: {
    id: 'recipes',
    title: 'Recipe Book',
    body:
      'A long chain of `elif`s gets tiring. A dictionary is a little book that looks things up for you. Each entry has a key on the left and its value on the right, with a colon between them.\n\n' +
      '`remedies["fever"]` looks up `"fever"` and gives back `Potion.cooling`.\n\n' +
      "`wanted in remedies` asks whether the book has an entry for it. Villagers and wizards aren't in the book, so they go to `else`.",
    example: RECIPE_BOOK + '\nwhile True:\n    wanted = order()\n    if wanted in remedies:\n        brew(remedies[wanted])\n    else:\n        brew(wanted)\n    serve()',
  },
  loops: {
    id: 'loops',
    title: 'Lists & Loops',
    body:
      'Knights order several potions at once. For a knight, `order()` gives back a list: potions inside square brackets, like `[Potion.health, Potion.mana]`.\n\n' +
      '`for p in wanted:` runs the indented lines once for each potion in the list, with `p` standing for the current one.\n\n' +
      '`isinstance(wanted, list)` asks "is this a list?". Your basket holds 3 potions, and `serve()` hands over everything in it.',
    example:
      RECIPE_BOOK +
      '\nwhile True:\n    wanted = order()\n    if isinstance(wanted, list):\n        for p in wanted:\n            brew(p)\n    elif wanted in remedies:\n        brew(remedies[wanted])\n    else:\n        brew(wanted)\n    serve()',
  },
};

export const PAGE_ORDER: PageId[] = ['first', 'repeat', 'choices', 'remedies', 'recipes', 'loops'];

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

export const STARTER_CODE = '# Your apprentice follows these lines, top to bottom.\nbrew(Potion.health)\nserve()\n';
