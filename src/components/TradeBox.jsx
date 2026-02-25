import { memo } from 'react';
import { useStore } from '../store/useStore.js';
import { useT } from '../i18n.js';

const TradeBox = memo(function TradeBox({ tokenId, outcome, canTrade }) {
  const lang = useStore((s) => s.lang);
  const ob = useStore((s) => s.orderBooks[tokenId]) ?? { bids: [], asks: [] };
  const shares = useStore((s) => s.sharesMap[tokenId] ?? 10);
  const setShares = useStore((s) => s.setShares);
  const openBuyModal = useStore((s) => s.openBuyModal);
  const t = useT(lang);

  const bestAsk = ob.asks?.[0]?.price ?? null;
  const cost = bestAsk != null ? (shares * bestAsk).toFixed(2) : '—';
  const profit = bestAsk != null ? (shares * (1 - bestAsk)).toFixed(2) : '—';
  const profitPct = bestAsk != null && bestAsk > 0 && bestAsk < 1
    ? ((1 - bestAsk) / bestAsk * 100).toFixed(0)
    : '—';

  const handleBuy = () => {
    if (!bestAsk || !canTrade) return;
    openBuyModal({ tokenId, outcome, askPrice: bestAsk, shares });
  };

  return (
    <div className={`trade-box ${canTrade ? '' : 'trade-box-disabled'}`}>
      <div className="trade-top-row">
        <span className="trade-ask-label">
          {t.marketBuy}:{' '}
          <strong className="ask-highlight">
            {bestAsk != null ? `${(bestAsk * 100).toFixed(1)}¢/${t.shareUnit}` : '—'}
          </strong>
        </span>
        <div className="trade-share-ctrl">
          <button className="trade-adj" onClick={() => setShares(tokenId, shares - 10)}>−10</button>
          <button className="trade-adj" onClick={() => setShares(tokenId, shares - 1)}>−</button>
          <span className="trade-shares-num">{shares}</span>
          <span className="shares-unit">{t.shareUnit}</span>
          <button className="trade-adj" onClick={() => setShares(tokenId, shares + 1)}>＋</button>
          <button className="trade-adj" onClick={() => setShares(tokenId, shares + 10)}>＋10</button>
        </div>
      </div>
      <div className="trade-bottom-row">
        <span className="trade-payout-info">
          {t.cost} <strong>${cost}</strong>
          {' → '}{t.payout} <strong>${shares}.00</strong>
          {bestAsk != null && (
            <span className="profit-badge"> +${profit} (+{profitPct}%)</span>
          )}
        </span>
        <button
          type="button"
          className="trade-buy-btn"
          disabled={!canTrade || bestAsk == null}
          onClick={handleBuy}
        >
          {canTrade ? t.buyBtn : t.unavailable}
        </button>
      </div>
    </div>
  );
});

export default TradeBox;
