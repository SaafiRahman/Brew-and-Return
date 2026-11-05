import { useEffect, useRef } from 'preact/hooks';
import { PAGE_ORDER, PAGES } from '../game/content';
import { useWorld, type Controller } from '../app/controller';
import { Rich } from './Rich';

export function Spellbook({ ctl }: { ctl: Controller }) {
  const w = useWorld(ctl);
  const open = ctl.spellbookOpen.value;
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current!;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const page = open ? PAGES[open] : undefined;

  return (
    <dialog ref={dialog} class="spellbook" onClose={() => (ctl.spellbookOpen.value = null)} aria-label="Spellbook">
      <nav class="spellbook-index">
        <div class="spellbook-title">📖 Spellbook</div>
        {PAGE_ORDER.map((id) => {
          const owned = w.pages.includes(id);
          return (
            <button
              key={id}
              class={`page-tab ${owned ? 'owned' : 'locked'} ${open === id ? 'current' : ''}`}
              disabled={!owned}
              onClick={() => (ctl.spellbookOpen.value = id)}
            >
              {owned ? PAGES[id].title : '??? (find it in the shop)'}
            </button>
          );
        })}
      </nav>
      {page && (
        <article class="spellbook-page">
          <h2>{page.title}</h2>
          {page.body.split('\n\n').map((para, i) => (
            <p key={i}>
              <Rich text={para} />
            </p>
          ))}
          <div class="example-label">Example</div>
          <pre class="example">{page.example}</pre>
        </article>
      )}
      <form method="dialog" class="close-row">
        <button class="btn">Close</button>
      </form>
    </dialog>
  );
}
