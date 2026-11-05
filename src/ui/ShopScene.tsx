import { POTIONS, potionCode, potionName, SHOP, WALK_TIME } from '../game/content';
import { itemCost } from '../game/world';
import type { Customer, PageId, PotionId } from '../game/types';
import { useWorld, type Controller } from '../app/controller';

export function ShopScene({ ctl }: { ctl: Controller }) {
  const w = useWorld(ctl);
  const a = w.apprentice;
  const [front, ...waiting] = w.queue;
  const walkSeconds = WALK_TIME / w.speed;

  return (
    <section class="shop" aria-label="Your potion shop">
      <div class="scene">
        <div class="wall">
          <div class="shelf" aria-hidden="true">
            <span>🧪</span>
            <span>🍯</span>
            <span>🌿</span>
            <span>🕯️</span>
            <span>📜</span>
          </div>
          <div class={`sign-board ${w.open ? 'is-open' : ''}`}>{w.open ? 'Open' : 'Closed'}</div>
          <div class="tally" title="Customers served · potions turned away · customers who gave up">
            ✅ {w.stats.served} · 🔁 {w.stats.rejected} · 🚪 {w.stats.leftUnhappy}
          </div>
        </div>

        <div class="window" aria-hidden="true" />
        <div class="floor">
          <div class="cauldron-station">
            <Cauldron brewing={a.activity === 'brewing'} color={a.brewing ? POTIONS[a.brewing].color : undefined} />
          </div>

          <div class="counter" aria-hidden="true" />

          <div
            class={`apprentice at-${a.spot} act-${a.activity}`}
            style={{ transitionDuration: `${walkSeconds}s` }}
            aria-label={`Your apprentice is ${a.activity}`}
          >
            {a.says && <div class="speech">{a.says}</div>}
            {a.holding && (
              <div class="held">
                <Potion id={a.holding} size={24} />
              </div>
            )}
            <span class="apprentice-emoji">🧙</span>
          </div>

          {front && <FrontCustomer c={front} />}

          <div class="queue" aria-label={`${waiting.length} more customers waiting in line`}>
            {waiting.map((c) => (
              <div class="customer waiting" key={c.id} title={`${c.name} wants a ${potionName(c.wants)}`}>
                <span class="mini-want">
                  <Potion id={c.wants} size={11} />
                </span>
                <span class="customer-emoji">{c.emoji}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ShopPanel ctl={ctl} />
    </section>
  );
}

function FrontCustomer({ c }: { c: Customer }) {
  const pct = Math.max(0, (c.patience / c.maxPatience) * 100);
  const mood = pct > 50 ? 'calm' : pct > 20 ? 'uneasy' : 'cross';
  return (
    <div class="front-customer" key={c.id}>
      <div class={`want ${c.wrongTries ? 'shake' : ''}`} key={`${c.id}-${c.wrongTries}`}>
        <Potion id={c.wants} size={20} />
        <span title={potionCode(c.wants)}>{potionName(c.wants)}</span>
      </div>
      <span class="customer-emoji">{c.emoji}</span>
      <div class="customer-name">
        {c.name}
        {c.wrongTries > 0 && <span class="wrong-tries"> · pays {Math.round(c.rewardMult * 100)}%</span>}
      </div>
      <div class={`patience ${mood}`} role="meter" aria-label="Patience" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Potion({ id, size = 18 }: { id: PotionId; size?: number }) {
  const color = POTIONS[id].color;
  return (
    <svg width={size} height={size * 1.25} viewBox="0 0 20 25" aria-hidden="true" class="potion-icon">
      <rect x="7" y="1" width="6" height="3" rx="1" fill="#8a5a35" />
      <path d="M8 4 h4 v4 l5 6 a7 7 0 0 1 -14 0 l5 -6 z" fill="#fffaf0" stroke="#5e3b22" stroke-width="1.2" />
      <path d="M4.2 15 a6 6 0 0 0 11.6 0 z" fill={color} />
      <circle cx="8" cy="17" r="1.2" fill="rgba(255,255,255,0.6)" />
    </svg>
  );
}

function Cauldron({ brewing, color }: { brewing: boolean; color?: string }) {
  const liquid = color ?? 'var(--teal)';
  return (
    <svg class={`cauldron ${brewing ? 'bubbling' : ''}`} width="116" height="102" viewBox="0 0 64 56" aria-hidden="true">
      <circle class="c-bubble cb1" cx="24" cy="14" r="4" fill={liquid} />
      <circle class="c-bubble cb2" cx="36" cy="10" r="3" fill={liquid} />
      <circle class="c-bubble cb3" cx="42" cy="16" r="2.5" fill={liquid} />
      <ellipse cx="32" cy="22" rx="24" ry="6" fill={liquid} />
      <path d="M8 22 Q6 50 32 52 Q58 50 56 22 Z" fill="#3a2e28" />
      <ellipse cx="32" cy="22" rx="26" ry="5" fill="none" stroke="#2a211c" stroke-width="4" />
      <path d="M16 51 l-4 4 M48 51 l4 4" stroke="#2a211c" stroke-width="4" stroke-linecap="round" />
      <path d="M16 30 Q14 42 24 46" stroke="rgba(255,255,255,0.15)" stroke-width="3" fill="none" stroke-linecap="round" />
    </svg>
  );
}

function ShopPanel({ ctl }: { ctl: Controller }) {
  const w = useWorld(ctl);
  const items = SHOP.filter((i) => i.visible(w));
  return (
    <div class="shop-panel" aria-label="Shop">
      {items.map((item) => {
        const cost = itemCost(w, item.id);
        const owned = cost === undefined;
        return (
          <div class={`shop-item ${owned ? 'owned' : ''}`} key={item.id}>
            <span class="shop-emoji" aria-hidden="true">
              {item.emoji}
            </span>
            <div class="shop-text">
              <div class="shop-title">
                {item.title}
                {item.id === 'cauldron' && <span class="level">Lv {w.cauldronLevel}</span>}
              </div>
              <div class="shop-blurb">{item.blurb}</div>
            </div>
            {owned ? (
              item.id.startsWith('page:') ? (
                <button class="btn small" onClick={() => (ctl.spellbookOpen.value = item.id.slice(5) as PageId)}>
                  Read
                </button>
              ) : (
                <span class="owned-tag">{item.id === 'cauldron' ? 'Max level' : 'Learned'}</span>
              )
            ) : (
              <button class="btn small buy" disabled={w.coins < cost} onClick={() => ctl.buy(item.id)}>
                {cost} 🪙
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
