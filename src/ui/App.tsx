import { useEffect, useRef, useState } from 'preact/hooks';
import { useWorld, type Controller } from '../app/controller';
import { knownPotions, POTIONS, SHOP } from '../game/content';
import { itemCost } from '../game/world';
import type { LedgerEntry, Receipt } from '../game/types';
import { CodeEditor } from './CodeEditor';
import { Rich } from './Rich';
import { ShopScene } from './ShopScene';
import { Spellbook } from './Spellbook';

const SPEEDS = [1, 2, 4];

export function App({ ctl }: { ctl: Controller }) {
  const w = useWorld(ctl);
  const [editorKey, setEditorKey] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);
  const canBuySomething = SHOP.some((i) => {
    const cost = itemCost(w, i.id);
    return i.visible(w) && cost !== undefined && w.coins >= cost;
  });

  const reset = () => {
    setConfirmReset(false);
    ctl.reset();
    setEditorKey((k) => k + 1);
  };

  return (
    <div class="app">
      <header class="topbar">
        <h1 class="logo">
          <span aria-hidden="true">🧪</span> Brew &amp; Return
        </h1>
        <div class={`stat coins ${canBuySomething ? 'can-buy' : ''}`} title={canBuySomething ? 'You can afford something in the shop!' : 'Coins'}>
          🪙 <strong>{w.coins}</strong>
        </div>
        <div class="spacer" />
        <button class="btn book" onClick={() => (ctl.spellbookOpen.value = w.pages[w.pages.length - 1])}>
          📖 Spellbook
        </button>
        <button class="btn ghost" onClick={() => setConfirmReset(true)} title="Start a new game">
          Start over
        </button>
      </header>

      <main class="layout">
        <ShopScene ctl={ctl} />
        <EditorPanel key={editorKey} ctl={ctl} />
        <Ledger ctl={ctl} />
      </main>

      <Spellbook ctl={ctl} />
      {confirmReset && <ConfirmReset onYes={reset} onNo={() => setConfirmReset(false)} />}
      {!ctl.runnerReady.value && <LoadingScreen text={ctl.runnerStatus.value} />}
    </div>
  );
}

function EditorPanel({ ctl }: { ctl: Controller }) {
  const w = useWorld(ctl);
  const running = ctl.running.value;
  const ready = ctl.runnerReady.value;
  const line = ctl.currentLine.value;
  const toggle = () => (ctl.running.value ? ctl.stop() : void ctl.run());

  return (
    <section class="editor-panel" aria-label="Your spell">
      <header class="panel-title">
        <span>📜 Your spell</span>
        <span class="muted">Your apprentice follows it line by line.</span>
      </header>
      <div class={`editor-wrap ${running ? 'is-running' : ''}`}>
        <CodeEditor
          initial={w.code}
          activeLine={running ? line : null}
          vocabulary={() => ({ potions: knownPotions(ctl.world).map((id) => ({ id, price: POTIONS[id].price })) })}
          onChange={(c) => ctl.setCode(c)}
          onRun={toggle}
        />
      </div>

      <LatestWarning ctl={ctl} />

      <div class="controls">
        {running ? (
          <button class="btn stop" onClick={() => ctl.stop()} title="Ctrl+Enter">
            ■ Stop
          </button>
        ) : (
          <button class="btn primary" disabled={!ready} onClick={() => void ctl.run()} title="Ctrl+Enter">
            ▶ Run
          </button>
        )}
        <div class="status-line">
          {!ready
            ? ctl.runnerStatus.value
            : running
              ? `Running${line ? ` line ${line}` : ''}… Edits apply the next time you press Run.`
              : 'The shop is closed. Time stands still until you press Run.'}
        </div>
        <div class="spacer" />
        <div class="speed" role="group" aria-label="Game speed">
          {SPEEDS.map((sp) => (
            <button key={sp} class={`seg ${w.speed === sp ? 'on' : ''}`} aria-pressed={w.speed === sp} onClick={() => ctl.setSpeed(sp)}>
              {sp}×
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/** The newest warning (an error hint or a turned-away potion), kept near the code. */
function LatestWarning({ ctl }: { ctl: Controller }) {
  const w = useWorld(ctl);
  const last = w.ledger[w.ledger.length - 1];
  const recent = [...w.ledger].reverse().find((e) => e.tone === 'warn');
  // Show it only while it's still the latest news (or the spell has stopped on it).
  if (!recent || (last !== recent && ctl.running.value)) return null;
  if (last !== recent && last.tone !== 'info') return null;
  return (
    <div class="note">
      <Entry e={recent} />
    </div>
  );
}

function Ledger({ ctl }: { ctl: Controller }) {
  const w = useWorld(ctl);
  const entries = [...w.ledger].reverse();
  return (
    <section class="ledger" aria-label="Ledger">
      <header class="panel-title">
        <span>📒 Ledger</span>
      </header>
      <ol class="ledger-list">
        {entries.map((e) => (
          <li key={e.id}>
            <Entry e={e} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function Entry({ e }: { e: LedgerEntry }) {
  return (
    <div class={`msg tone-${e.tone}`}>
      <Rich text={e.text} />
      {e.receipt && <ReceiptLine r={e.receipt} />}
      {e.detail && (
        <details>
          <summary>Show the raw error</summary>
          <pre>{e.detail}</pre>
        </details>
      )}
    </div>
  );
}

/** The receipt for one delivery: what order() said, what was handed over, and (if wrong) what would have worked. */
function ReceiptLine({ r }: { r: Receipt }) {
  return (
    <div class={`receipt ${r.ok ? 'ok' : 'wrong'}`}>
      <span>
        order() → <code>{r.asked}</code>
      </span>
      <span>
        gave <code>{r.gave}</code> {r.ok ? '✓' : '✗'}
      </span>
      {!r.ok && (
        <span>
          needed <code>{r.expected}</code>
        </span>
      )}
    </div>
  );
}

function ConfirmReset({ onYes, onNo }: { onYes(): void; onNo(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);
  return (
    <dialog ref={ref} class="confirm" onClose={onNo} aria-labelledby="confirm-title">
      <h2 id="confirm-title">Start over?</h2>
      <p>Your coins, recipes, Spellbook pages and spell will be forgotten, and the first customer will be back at the counter.</p>
      <div class="confirm-row">
        <button class="btn" onClick={onNo} autofocus>
          Keep my shop
        </button>
        <button class="btn danger" onClick={onYes}>
          Start over
        </button>
      </div>
    </dialog>
  );
}

function LoadingScreen({ text }: { text: string }) {
  return (
    <div class="loading" role="status">
      <div class="loading-card">
        <div class="loading-cauldron" aria-hidden="true">
          <span class="lb b1" />
          <span class="lb b2" />
          <span class="lb b3" />
          🧙
        </div>
        <div class="loading-title">Brew &amp; Return</div>
        <div class="loading-text">{text}</div>
        <div class="loading-sub">Getting real Python ready in your browser. This takes a few seconds the first time.</div>
      </div>
    </div>
  );
}
