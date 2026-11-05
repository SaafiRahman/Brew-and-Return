import { useState } from 'preact/hooks';
import { useGame, type Controller } from '../app/controller';
import { PAGES } from '../game/content';
import { REP_MAX } from '../game/engine';
import type { Receipt } from '../game/types';
import { CodeEditor } from './CodeEditor';
import { Ledger, ReceiptCard } from './Ledger';
import { Rich } from './Rich';
import { ShopScene } from './ShopScene';
import { Spellbook } from './Spellbook';

const SPEEDS = [1, 2, 4];

export function App({ ctl }: { ctl: Controller }) {
  const s = useGame(ctl);
  const [editorKey, setEditorKey] = useState(0);
  const canAffordNewPage = s.availablePages.some((p) => !s.pages.includes(p) && s.coins >= PAGES[p].cost);

  const reset = () => {
    if (confirm('Start over from the very first customer? Your coins, pages and spell will be forgotten.')) {
      ctl.reset();
      setEditorKey((k) => k + 1);
    }
  };

  return (
    <div class="app">
      <header class="topbar">
        <h1 class="logo">
          <span aria-hidden="true">🧪</span> Brew &amp; Return
        </h1>
        <div class="stat coins" title="Coins">
          🪙 <strong>{s.coins}</strong>
        </div>
        <div class="stat rep" title={`Reputation ${s.reputation}/${REP_MAX}: higher reputation brings customers more often`}>
          ⭐
          <span class="rep-bar">
            <span style={{ width: `${s.reputation}%` }} />
          </span>
        </div>
        <div class="spacer" />
        <button class={`btn book ${canAffordNewPage ? 'glow' : ''}`} onClick={() => (ctl.spellbookOpen.value = s.pages[s.pages.length - 1])}>
          📖 Spellbook
        </button>
        <button class="btn ghost" onClick={reset} title="Start a new game">
          Start over
        </button>
      </header>

      <main class="layout">
        <ShopScene ctl={ctl} />
        <EditorPanel key={editorKey} ctl={ctl} editorKey={editorKey} />
        <Ledger ctl={ctl} />
      </main>

      <Spellbook ctl={ctl} />
      {!ctl.runnerReady.value && <LoadingScreen text={ctl.runnerStatus.value} />}
    </div>
  );
}

function EditorPanel({ ctl, editorKey }: { ctl: Controller; editorKey: number }) {
  const s = useGame(ctl);
  const [code, setCode] = useState(s.code);
  const live = ctl.liveCode.value;
  const dirty = s.open && live !== null && live !== code;
  const busy = ctl.busy.value || !ctl.runnerReady.value;

  const onChange = (c: string) => {
    ctl.setCode(c);
    setCode(c);
  };
  const run = () => void ctl.openShop();

  return (
    <section class="editor-panel" aria-label="Your spell">
      <header class="panel-title">
        <span>📜 Your spell</span>
        <span class="muted">
          The shop calls <code>serve(order)</code> for each customer and hands over what it returns.
        </span>
      </header>
      <div class="editor-wrap">
        <CodeEditor key={editorKey} initial={s.code} onChange={onChange} onRun={run} />
      </div>

      <ApprenticeNote ctl={ctl} />

      <div class="controls">
        {!s.open ? (
          <button class="btn primary" disabled={busy} onClick={run} title="Ctrl+Enter">
            ▶ Open Shop
          </button>
        ) : (
          <>
            <button class="btn primary" disabled={busy || !dirty} onClick={run} title="Ctrl+Enter">
              ✨ Update Spell
            </button>
            <button class="btn" onClick={() => ctl.closeShop()}>
              ⏸ Close Shop
            </button>
          </>
        )}
        <button class="btn" disabled={busy} onClick={() => void ctl.practice()} title="Try your spell on a sample order. No coins, no penalty.">
          🧪 Practice Customer
        </button>
        <div class="spacer" />
        <div class="speed" role="group" aria-label="Game speed">
          {SPEEDS.map((sp) => (
            <button key={sp} class={`seg ${s.speed === sp ? 'on' : ''}`} aria-pressed={s.speed === sp} onClick={() => ctl.setSpeed(sp)}>
              {sp}×
            </button>
          ))}
        </div>
      </div>
      <div class="status-line">
        {!ctl.runnerReady.value
          ? ctl.runnerStatus.value
          : dirty
            ? 'You changed your spell. Press Update Spell to use it.'
            : s.open
              ? 'The shop is open. Your apprentice is serving customers with your spell.'
              : 'The shop is closed. Press Open Shop (or Ctrl+Enter) to start serving.'}
      </div>
    </section>
  );
}

/** The latest thing worth reading: a muddled receipt, a practice result, or a warning. */
function ApprenticeNote({ ctl }: { ctl: Controller }) {
  const game = useGame(ctl);
  const ledger = game.ledger;
  let i = ledger.length - 1;
  // A warning (e.g. "the shop paused") may follow the receipt that explains it: show both.
  const warn = ledger[i]?.type === 'message' && (ledger[i] as { tone: string }).tone === 'warn' ? ledger[i--] : undefined;
  while (i >= 0 && ledger[i].type === 'message' && (ledger[i] as { tone: string }).tone !== 'warn') i--;
  const prev = ledger[i];
  let receipt: Receipt | undefined;
  if (prev?.type === 'receipt' && (prev.receipt.practice || prev.receipt.verdict !== 'correct')) receipt = prev.receipt;
  if (!receipt && !warn) return null;
  const last = warn?.type === 'message' ? warn : undefined;
  return (
    <div class="note">
      {receipt && <ReceiptCard r={receipt} ctl={ctl} compact={false} />}
      {last && (
        <div class="msg tone-warn">
          <Rich text={last.text} />
          {last.detail && (
            <details>
              <summary>Show the raw error</summary>
              <pre>{last.detail}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function LoadingScreen({ text }: { text: string }) {
  return (
    <div class="loading" role="status">
      <div class="loading-card">
        <div class="loading-cauldron" aria-hidden="true">
          <span class="bubble b1" />
          <span class="bubble b2" />
          <span class="bubble b3" />
          🫕
        </div>
        <div class="loading-title">Brew &amp; Return</div>
        <div class="loading-text">{text}</div>
        <div class="loading-sub">Getting real Python ready in your browser. This takes a few seconds the first time.</div>
      </div>
    </div>
  );
}
