export const WINDOW_SEC = 300;
export const ASSETS = ['btc', 'eth', 'sol', 'xrp'];
export const LOOK_BACK = 0;
export const LOOK_AHEAD = 1;
export const REFRESH_SEC = 3;
export const PRICE_REFRESH_MS = 3000;
export const POSITIONS_REFRESH_SEC = 3;

export function currentWindowStart() {
  const now = Math.floor(Date.now() / 1000);
  return Math.floor(now / WINDOW_SEC) * WINDOW_SEC;
}

export function buildSlug(windowTs, asset = 'btc') {
  return `${asset}-updown-5m-${windowTs}`;
}

export function windowsToTrack(lookBack, lookAhead) {
  const base = currentWindowStart();
  const out = [];
  for (let offset = -lookBack; offset <= lookAhead; offset++) {
    out.push(base + offset * WINDOW_SEC);
  }
  return out;
}

export function windowLabel(windowTs) {
  const dt = new Date(windowTs * 1000);
  const endDt = new Date((windowTs + WINDOW_SEC) * 1000);
  const fmt = (d) =>
    `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  return `${fmt(dt)} → ${fmt(endDt)} UTC`;
}

export function secondsUntilEnd(windowTs) {
  return Math.max(0, windowTs + WINDOW_SEC - Math.floor(Date.now() / 1000));
}

export function secondsElapsed(windowTs) {
  return Math.max(0, Math.floor(Date.now() / 1000) - windowTs);
}

export function formatUtcNow() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function parseJson(val, fallback) {
  if (typeof val !== 'string') return Array.isArray(val) ? val : fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

export function parseMarket(raw, windowTs, asset) {
  const outcomes = parseJson(raw.outcomes, []);
  const outcomePrices = parseJson(raw.outcomePrices, []);
  const clobTokenIds = parseJson(raw.clobTokenIds, []);
  const prices = outcomePrices.map((p) => { const n = parseFloat(p); return isNaN(n) ? null : n; });
  const eventStartTime = typeof raw.eventStartTime === 'string' ? raw.eventStartTime : undefined;
  return {
    slug: raw.slug ?? buildSlug(windowTs, asset),
    question: raw.question ?? '—',
    active: Boolean(raw.active),
    closed: Boolean(raw.closed),
    accepting_orders: Boolean(raw.acceptingOrders),
    outcomes,
    prices,
    token_ids: clobTokenIds,
    condition_id: raw.conditionId ?? '',
    end_date: String(raw.endDate ?? ''),
    window_ts: windowTs,
    event_start_time: eventStartTime,
    price_to_beat: null,
    current_price: null,
  };
}

export function mergeOrderBook(existing, incoming) {
  const mergeSide = (oldLev, newLev) => {
    const out = [];
    for (let i = 0; i < 5; i++) {
      const n = newLev[i];
      const o = oldLev[i];
      if (n && n.price > 0) {
        out.push({ price: n.price, size: n.size > 0 ? n.size : (o?.size ?? 0) });
      } else if (o && o.price > 0) {
        out.push({ price: o.price, size: o.size });
      }
    }
    return out.sort((a, b) => b.price - a.price).slice(0, 5);
  };
  return {
    bids: mergeSide(existing?.bids ?? [], incoming.bids ?? []),
    asks: mergeSide(existing?.asks ?? [], incoming.asks ?? []).sort((a, b) => a.price - b.price),
  };
}

export function statusBadge(market) {
  if (!market) return 'NOT FOUND';
  if (market.closed) return 'CLOSED';
  if (!market.active) return 'INACTIVE';
  if (market.accepting_orders) return 'LIVE ●';
  return 'ACTIVE';
}

export function statusClass(market) {
  if (!market) return 'status-dim';
  if (market.closed) return 'status-closed';
  if (market.active && !market.closed) return 'status-live';
  return 'status-inactive';
}

export function panelClass(market) {
  if (!market) return 'panel-dim';
  if (market.active && !market.closed) return 'panel-live';
  if (market.closed) return 'panel-closed';
  return 'panel-inactive';
}
