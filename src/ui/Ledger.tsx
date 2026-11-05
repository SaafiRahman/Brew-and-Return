import { PAGES } from '../game/content';
import type { LedgerEntry, Receipt } from '../game/types';
import { useGame, type Controller } from '../app/controller';
import { py, Rich } from './Rich';

const VERDICT_ICON = { correct: '✅', wrong: '🤔', error: '📜', timeout: '💤' } as const;

export function Ledger({ ctl }: { ctl: Controller }) {
  const game = useGame(ctl);
  const entries = [...game.ledger].reverse();
  return (
    <section class="ledger" aria-label="Ledger">
      <header class="panel-title">
        <span>📒 Ledger</span>
        <span class="ledger-stats">
          {game.stats.correct} served · {game.stats.wrong} muddled
        </span>
      </header>
      <ol class="ledger-list" aria-live="polite">
        {entries.map((e) => (
          <li key={e.type === 'receipt' ? e.receipt.id : e.id}>
            <Entry e={e} ctl={ctl} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function Entry({ e, ctl }: { e: LedgerEntry; ctl: Controller }) {
  if (e.type === 'message') {
    return (
      <div class={`msg tone-${e.tone}`}>
        <Rich text={e.text} />
        {e.detail && (
          <details>
            <summary>Show the raw error</summary>
            <pre>{e.detail}</pre>
          </details>
        )}
      </div>
    );
  }
  return <ReceiptCard r={e.receipt} ctl={ctl} />;
}

export function ReceiptCard({ r, ctl, compact = true }: { r: Receipt; ctl: Controller; compact?: boolean }) {
  const ok = r.verdict === 'correct';
  return (
    <div class={`receipt verdict-${r.verdict} ${r.practice ? 'practice' : ''} ${compact ? 'compact' : ''}`}>
      <div class="receipt-head">
        <span class="receipt-icon">{VERDICT_ICON[r.verdict]}</span>
        <span class="receipt-who">
          {r.customer.emoji} {r.customer.name}
        </span>
        {r.practice && <span class="tag">Practice</span>}
        {r.customer.teaser && <span class="tag new">New customer</span>}
        <span class="receipt-coins">
          {ok && !r.practice ? `+${r.coins}${r.tip ? ` (+${r.tip} tip)` : ''} 🪙` : ''}
          {r.repDelta < 0 ? ` ${r.repDelta} ⭐` : ''}
        </span>
      </div>
      <dl class="receipt-body">
        <div>
          <dt>Order</dt>
          <dd>
            {Object.entries(r.customer.order).map(([k, v]) => (
              <code key={k}>
                order.{k} → {py(v)}
              </code>
            ))}
          </dd>
        </div>
        {r.verdict !== 'error' && r.verdict !== 'timeout' && (
          <div>
            <dt>You gave</dt>
            <dd>
              <code>{py(r.got)}</code>
            </dd>
          </div>
        )}
        {!ok && (
          <div>
            <dt>Wanted</dt>
            <dd>
              <code>{py(r.customer.expected)}</code>
            </dd>
          </div>
        )}
      </dl>
      {r.hint && (
        <p class="receipt-hint">
          <Rich text={r.hint} />
        </p>
      )}
      {r.suggestPage && (
        <button class="btn small book" onClick={() => (ctl.spellbookOpen.value = r.suggestPage!)}>
          📖 The Spellbook page “{PAGES[r.suggestPage].title}” can help
        </button>
      )}
      {r.stdout && (
        <details>
          <summary>Your apprentice muttered…</summary>
          <pre>{r.stdout}</pre>
        </details>
      )}
      {r.traceback && (
        <details>
          <summary>Show the raw error</summary>
          <pre>{r.traceback}</pre>
        </details>
      )}
    </div>
  );
}
