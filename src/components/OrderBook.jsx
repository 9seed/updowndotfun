import { memo } from 'react';
import { useStore } from '../store/useStore.js';
import { useT } from '../i18n.js';

const DEPTH = 5;

const OrderBook = memo(function OrderBook({ tokenId, outcome }) {
  const lang = useStore((s) => s.lang);
  const ob = useStore((s) => s.orderBooks[tokenId]) ?? { bids: [], asks: [] };
  const t = useT(lang);

  const bids = ob.bids.slice(0, DEPTH);
  const asks = ob.asks.slice(0, DEPTH);
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? (bestBid != null ? Math.min(bestBid + 0.01, 0.99) : null);

  const outcomeClass = outcome?.toLowerCase().includes('up') ? 'up' : 'down';
  const bidStr = bestBid != null ? `${(bestBid * 100).toFixed(1)}¢` : '—';
  const askStr = bestAsk != null ? `${(bestAsk * 100).toFixed(1)}¢` : '—';

  return (
    <div>
      <div className="outcome-header">
        <span className={`outcome-name ${outcomeClass}`}>{outcome}</span>
        <span className="spread-info">
          {t.bid} <strong>{bidStr}</strong> / {t.ask} <strong className="ask-highlight">{askStr}</strong>
        </span>
      </div>
      <div className="depth-table">
        <div className="depth-header">
          <span>{t.bid}</span>
          <span>{t.ask}</span>
        </div>
        {Array.from({ length: DEPTH }, (_, j) => {
          const b = bids[j];
          const a = asks[j];
          return (
            <div key={j} className="depth-row">
              <span className="bid-entry">
                {b && b.price > 0 ? `${(b.price * 100).toFixed(1)}¢ × ${b.size.toFixed(0)}` : <span className="depth-placeholder">—</span>}
              </span>
              <span className="ask-entry">
                {a && a.price > 0 ? `${(a.price * 100).toFixed(1)}¢ × ${a.size.toFixed(0)}` : <span className="depth-placeholder">—</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default OrderBook;
