import { CHALKBOARD, KINDS, UPGRADES } from '../game/content';
import { upgradeCost } from '../game/engine';
import { chalkboardSymptoms } from '../game/progression';
import type { Customer, UpgradeId } from '../game/types';
import { useGame, type Controller } from '../app/controller';
import { py } from './Rich';

export function ShopScene({ ctl }: { ctl: Controller }) {
  const s = useGame(ctl);
  const counter = ctl.counter.value;
  const [front, ...waiting] = s.queue;
  const symptoms = chalkboardSymptoms(s);
  const reacting = counter?.phase === 'reacting' ? counter : null;

  return (
    <section class="shop" aria-label="Your potion shop">
      <div class="scene">
        <div class="wall">
          <div class="shelf">
            <span>🧪</span><span>⚗️</span><span>🍯</span><span>🌿</span><span>🧪</span><span>🕯️</span>
          </div>
          <div class={`sign-board ${s.open ? 'is-open' : ''}`}>{s.open ? 'Open' : 'Closed'}</div>
          {symptoms.length > 0 && (
            <div class="chalkboard" aria-label="The healer's chalkboard">
              <div class="chalkboard-title">Cures</div>
              <ul>
                {symptoms.map((sym) => (
                  <li key={sym}>
                    <span>{sym}</span> → <span>{CHALKBOARD[sym]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div class="floor">
          <div class="queue" aria-label="Customers waiting">
            {waiting.map((c) => (
              <div class="customer waiting" key={c.id} title={`${c.name} (${KINDS[c.kind].title})`}>
                <span class="customer-emoji">{c.emoji}</span>
              </div>
            ))}
          </div>

          {front ? (
            <FrontCustomer c={front} brewing={counter?.customerId === front.id && counter.phase === 'brewing'} />
          ) : reacting ? null : (
            <div class="empty-counter">{s.open ? 'Waiting for the next customer…' : 'The shop is quiet.'}</div>
          )}

          {reacting && (
            <div key={reacting.customerId} class={`reaction ${reacting.verdict === 'correct' ? 'happy' : 'confused'}`}>
              {reacting.verdict === 'correct' ? `😊 +${reacting.earned} 🪙` : reacting.verdict === 'timeout' ? '💤' : '🤔'}
            </div>
          )}
        </div>

        <div class="counter-top">
          <span class={`cauldron ${counter?.phase === 'brewing' ? 'bubbling' : ''}`} aria-hidden="true">🫕</span>
        </div>
      </div>

      <div class="upgrades">
        {(Object.keys(UPGRADES) as UpgradeId[]).map((id) => {
          const def = UPGRADES[id];
          const lvl = s.upgrades[id];
          const cost = upgradeCost(s, id);
          return (
            <div class="upgrade" key={id}>
              <div class="upgrade-head">
                <span class="upgrade-emoji">{def.emoji}</span>
                <div>
                  <div class="upgrade-title">
                    {def.title} <span class="level">Lv {lvl}</span>
                  </div>
                  <div class="upgrade-desc">{def.describe(lvl)}</div>
                </div>
              </div>
              {cost === undefined ? (
                <span class="maxed">Fully upgraded</span>
              ) : (
                <button class="btn small" disabled={s.coins < cost} onClick={() => ctl.buyUpgrade(id)}>
                  Upgrade · {cost} 🪙
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FrontCustomer({ c, brewing }: { c: Customer; brewing: boolean }) {
  return (
    <div class={`front ${brewing ? 'brewing' : ''}`}>
      <div class="bubble">
        {c.teaser && <div class="new-badge">New customer!</div>}
        <div class="bubble-name">
          {c.name} <span class="kind">· {KINDS[c.kind].title}</span>
        </div>
        <div class="bubble-line">“{c.line}”</div>
        <div class="order-slip" aria-label="Order slip">
          {Object.entries(c.order).map(([k, v]) => (
            <div key={k}>
              <code>
                order.{k} <span class="slip-eq">→</span> {py(v)}
              </code>
            </div>
          ))}
        </div>
      </div>
      <div class="customer at-counter">
        <span class="customer-emoji">{c.emoji}</span>
      </div>
    </div>
  );
}
