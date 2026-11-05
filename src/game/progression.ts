import {
  ALL_SYMPTOMS,
  BUSY_SYMPTOMS,
  healerOrder,
  knightOrder,
  SMALL_SYMPTOMS,
  VILLAGER_POTIONS,
  villagerOrder,
  type MadeOrder,
} from './content';
import { pick, randInt } from './rng';
import type { GameState, KindId, PageId } from './types';

/**
 * The first-session story. Each stage introduces one new kind of customer:
 * a "teaser" arrives first (old code usually fails), its receipt points to a
 * Spellbook page, and buying that page lets that customer type visit regularly.
 */
export interface StageDef {
  id: string;
  /** Kind whose correct serves count toward finishing this stage. */
  focus: KindId;
  /** Page that unlocks this stage's customers (absent = unlocked straight away). */
  page?: PageId;
  /** Correct serves of `focus` (after the page is owned) needed to move on. */
  advanceAfter: number;
  teaser?: (s: GameState) => { kind: KindId; made: MadeOrder };
  /** Ledger message when the teaser walks in. */
  intro?: string;
}

export const STAGES: StageDef[] = [
  { id: 'opening', focus: 'first', advanceAfter: 1 },
  {
    id: 'villagers',
    focus: 'villager',
    advanceAfter: 4,
    teaser: () => ({ kind: 'villager', made: villagerOrder('mana potion') }),
    intro: 'Word is spreading! Villagers want all sorts of potions now.',
  },
  {
    id: 'healer',
    focus: 'healer',
    page: 'conditionals',
    advanceAfter: 5,
    teaser: (s) => ({ kind: 'healer', made: healerOrder(pick(s, SMALL_SYMPTOMS)) }),
    intro: 'A healer from the infirmary is here. They describe symptoms, not potions. The chalkboard by the door says what cures what.',
  },
  {
    id: 'busy-season',
    focus: 'healer',
    page: 'dictionaries',
    advanceAfter: 5,
    teaser: (s) => ({ kind: 'healer', made: healerOrder(pick(s, BUSY_SYMPTOMS)) }),
    intro: 'Cold and flu season! The chalkboard just got a lot longer.',
  },
  {
    id: 'knight',
    focus: 'knight',
    page: 'loops',
    advanceAfter: 5,
    teaser: () => ({ kind: 'knight', made: knightOrder('stamina potion', 3) }),
    intro: 'Clank, clank. A knight wants potions for the whole squad!',
  },
  { id: 'end', focus: 'knight', advanceAfter: Infinity },
];

export const currentStage = (s: GameState) => STAGES[Math.min(s.stage, STAGES.length - 1)];

/** True once the given stage's customers can visit regularly. */
export function stageUnlocked(s: GameState, index: number): boolean {
  if (s.stage < index) return false;
  const page = STAGES[index].page;
  return !page || s.pages.includes(page);
}

/** Which customer kinds can visit right now, with spawn weights. */
export function customerMix(s: GameState): { kind: KindId; weight: number }[] {
  if (s.stage === 0) return [{ kind: 'first', weight: 1 }];
  const mix: { kind: KindId; weight: number }[] = [{ kind: 'villager', weight: 1 }];
  if (stageUnlocked(s, 2)) mix.push({ kind: 'healer', weight: 2 });
  if (stageUnlocked(s, 4)) mix.push({ kind: 'knight', weight: 2 });
  return mix;
}

/** Symptoms the chalkboard currently shows. */
export function chalkboardSymptoms(s: GameState): string[] {
  if (s.stage < 2) return [];
  return s.stage >= 3 ? ALL_SYMPTOMS : SMALL_SYMPTOMS;
}

/** Make a regular (non-teaser) order for a kind, given current progress. */
export function makeOrder(s: GameState, kind: KindId): MadeOrder {
  switch (kind) {
    case 'first':
      return villagerOrder('health potion');
    case 'villager':
      return villagerOrder(pick(s, VILLAGER_POTIONS));
    case 'healer':
      return healerOrder(pick(s, stageUnlocked(s, 3) ? ALL_SYMPTOMS : SMALL_SYMPTOMS));
    case 'knight':
      return knightOrder(pick(s, VILLAGER_POTIONS), randInt(s, 2, 4));
  }
}
