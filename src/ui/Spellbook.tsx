import { useEffect, useRef } from 'preact/hooks';
import { PAGE_ORDER, PAGES } from '../game/content';
import type { PageId } from '../game/types';
import { useGame, type Controller } from '../app/controller';
import { Rich } from './Rich';

export function Spellbook({ ctl }: { ctl: Controller }) {
  const open = ctl.spellbookOpen.value;
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current!;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const s = useGame(ctl);
  const page = open ? PAGES[open] : undefined;
  const owned = open ? s.pages.includes(open) : false;

  return (
    <dialog ref={dialog} class="spellbook" onClose={() => (ctl.spellbookOpen.value = null)} aria-label="Spellbook">
      <nav class="spellbook-index">
        <div class="spellbook-title">📖 Spellbook</div>
        {PAGE_ORDER.map((id) => {
          const state = s.pages.includes(id) ? 'owned' : s.availablePages.includes(id) ? 'available' : 'locked';
          return (
            <button
              key={id}
              class={`page-tab ${state} ${open === id ? 'current' : ''}`}
              disabled={state === 'locked'}
              onClick={() => (ctl.spellbookOpen.value = id)}
            >
              {state === 'locked' ? '??? (a customer will reveal it)' : PAGES[id].title}
              {state === 'available' && <span class="price">{PAGES[id].cost} 🪙</span>}
            </button>
          );
        })}
      </nav>
      {page && (
        <article class="spellbook-page">
          <h2>{page.title}</h2>
          {owned ? (
            <>
              {page.body.split('\n\n').map((para, i) => (
                <p key={i}>
                  <Rich text={para} />
                </p>
              ))}
              <div class="example-label">Example</div>
              <pre class="example">{page.example}</pre>
            </>
          ) : (
            <div class="page-locked">
              <p>{page.blurb}</p>
              <p class="muted">Buy this page to learn the spell. New customers who need it will start visiting.</p>
              <button class="btn primary" disabled={s.coins < page.cost} onClick={() => ctl.buyPage(page.id as PageId)}>
                Buy page · {page.cost} 🪙
              </button>
              {s.coins < page.cost && <p class="muted">You have {s.coins} 🪙. Keep serving customers!</p>}
            </div>
          )}
        </article>
      )}
      <form method="dialog" class="close-row">
        <button class="btn">Close</button>
      </form>
    </dialog>
  );
}
