# Brew & Return — Project Brief

You are helping me build **Brew & Return**, a cozy, browser-based incremental game that teaches beginners Python. The player is an apprentice wizard running a potion shop. Customers arrive with orders, and the player writes Python code that fills them. Better code serves more customers, earns more coins, and unlocks new customers who need new programming concepts.

Before writing code, read this whole brief, then propose an implementation plan for **Milestone 1** (see bottom) and ask me any questions. Work in small, reviewable steps with clear commits.

---

## Goals

- **Audience:** complete beginners who want to learn to code in a fun way. Assume zero programming knowledge.
- **Feel:** cozy and wholesome. Warm colors, gentle humor, no harsh failure states.
- **Hook:** a simple, satisfying, "one more customer" loop.
- **Pacing:** about **70% active coding, 30% idle**. The shop earns while you're away, but the best rewards and all progression come from actively improving your code.
- **Learning:** concepts are introduced only when the player feels the need for them. Every new customer type is secretly a test case the player's old code fails.

## Core loop

1. A customer walks up with an order.
2. The game calls the player's function: `serve(order)`.
3. Whatever the function returns is handed to the customer.
4. Correct: coins, tips, reputation. Wrong: a confused customer and a **receipt** explaining what happened.
5. Coins buy upgrades → more customers and harder orders → old code breaks → player learns something new.

---

## Tech stack (suggested; propose changes if you have good reasons)

- **Vite + TypeScript**, no heavy framework required (a light one like Preact or Svelte is fine if it helps).
- **CodeMirror 6** for the editor (Python syntax highlighting, friendly theme).
- **Pyodide** (real Python in the browser) running inside a **Web Worker**.
- **localStorage** for saves (versioned save format so it can be migrated later).
- Static site, deployable to GitHub Pages.

### Architecture requirements

- **Event-driven player code.** The game calls the player's functions (`serve(order)`), rather than the player writing one long-running script. This keeps code small and beginner-friendly.
- **Language-agnostic game API.** Orders go in and results come out as plain data (JSON-serializable). Wrap Python execution behind a `CodeRunner` interface so a JavaScript runner (or others) can be added later without touching game logic. Only implement Python now.
- **Safety:** run player code in the worker with a timeout (e.g., ~1s per call). On timeout, terminate and restart the worker and show a friendly message ("Your apprentice got stuck in a loop and fell asleep!").
- **Game time is measured in game actions, not CPU time.** Calls like `brew()` cost game time. This makes efficiency deterministic and fair.
- **Pyodide loading** takes a few seconds; show a cozy loading screen ("Warming up the cauldron…").
- Keep game logic (economy, customers, progression) separate from rendering and testable with unit tests.

---

## Game API available to player code

Start minimal; more functions unlock through progression.

```python
def serve(order):
    ...  # player writes this; return the potion(s)

order.potion      # e.g. "health potion" (early orders)
order.symptom     # e.g. "headache" (healer orders)
order.quantity    # e.g. 3 (knight orders)
order.budget      # coins (merchant orders)

brew(*ingredients)              # returns a potion, costs game time + ingredients
brew_batch(*ingredients, n)     # unlocked by Big Cauldron upgrade; cheaper per potion
inventory                       # dict of ingredient -> count
buy(ingredient, amount)         # spend coins to restock
```

Early on, returning a potion name string is enough (no brewing needed). Brewing and inventory arrive a little later to introduce function calls and efficiency.

---

## First-session progression (concepts unlock as needed)

1. **Customer 1** — editor is prefilled: `def serve(order):\n    return ___`. Order card: "Health Potion, please!" Player types `"health potion"`. Teaches strings and `return` without naming them.
2. **Customer 2** wants a mana potion. Old code fails. Introduce `order.potion` → `return order.potion`.
3. **Healer** describes symptoms ("headache"). A recipe chalkboard maps symptom → potion. Teaches `if` / `elif`.
4. **Many symptoms** make the if-chain painful → unlock the **Recipe Book** page (dicts).
5. **Knight** wants multiple potions → lists, then `for` loops.
6. **Brewing** appears → calling functions, inventory checks, variables.

The first coin should arrive within 60 seconds of starting.

## Customer types

| Customer | Order style | Concept taught |
|---|---|---|
| Villager | Named potion | strings, return |
| Healer | Symptom | conditionals, dicts |
| Knight | Quantity | lists, loops |
| Child | Messy input like `"  HEALTH potion!!"` | `.lower()`, `.strip()`, edge cases |
| Merchant | Budget; wants best affordable potion | comparisons, `min`/`max`, filtering |
| Wizard | Exact ingredient list | working with lists of data |
| Critic | Pays big for fast service (active play only) | efficiency |
| Regular | Wants "the usual" | state that persists between calls |

## Upgrades

- **Shop (hardware):** Big Cauldron (batch brewing), extra counters (serve several customers at once), shop sign (more foot traffic), herb garden (cheaper ingredients).
- **Spellbook (knowledge):** each page is a Python concept (Strings, Conditionals, Dictionaries, Loops, Helper Functions…). Buying a page unlocks the customers who need it and adds a short, friendly in-world explanation with an example. The Spellbook doubles as in-game reference docs.
- Don't block Python syntax. If a player uses a concept early, reward it ("You discovered a loop! +50 coins").

## Active vs idle (70/30)

- **Idle:** while the shop is open (and offline), earnings are estimated from the player's recent stats (success rate × orders per minute) at a reduced rate, capped at a few hours. **Never run player code offline.**
- **Active-only rewards:** new customer types, tips for fast service, Critics, special orders, all Spellbook progression.

## Failure and feedback (must feel kind)

- No game over. Wrong orders only cost a little reputation.
- Every order produces a **receipt**: the order, what the code returned, and what was expected.
- Python errors are translated into in-world, plain-English hints (e.g., missing return → "Your apprentice stood there holding nothing. Did you forget to `return` something?"). Show the raw traceback in an expandable section.
- A **Practice Customer** button runs the code against a sample order with no penalty.

## Screen layout

- **Left:** shop scene — customer queue, counter, cauldron.
- **Right:** code editor with Run / Practice buttons and speed controls.
- **Bottom:** scrolling ledger of receipts, coins, and messages.
- Simple, cozy visuals are fine for now (CSS/SVG/emoji placeholders); real art later.

## Later (out of scope for now, but don't design ourselves into a corner)

- More towns as prestige (Blacksmith → objects/classes, Post Office → sorting, Library → searching), keeping the Spellbook.
- Additional languages (JavaScript first) via the `CodeRunner` interface.
- Achievements, sound, real art.

---

## Milestone 1 (build this first)

A playable vertical slice of the first ~10 minutes:

- Project scaffold (Vite + TS), deploys to GitHub Pages.
- Pyodide running in a Web Worker behind a `CodeRunner` interface, with timeouts.
- Editor, shop view, and ledger in the layout above.
- Customers 1–5 from the progression (Villager, mana potion, Healer, Recipe Book/dicts, Knight/loops).
- Coins, a couple of upgrades, 2–3 Spellbook pages.
- Receipts, friendly error messages, Practice Customer.
- Save/load to localStorage.
- Unit tests for game logic.

Start by proposing the plan and file structure, then build it step by step.
