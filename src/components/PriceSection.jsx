export default function PriceSection({ market }) {
  const ptb = market?.price_to_beat ?? null;
  const curr = market?.current_price ?? null;

  const fmt = (v) =>
    v != null
      ? `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '—';

  let diffStr = '—';
  let diffClass = 'price-diff-neutral';
  if (ptb != null && curr != null && ptb > 0) {
    const diffPct = ((curr - ptb) / ptb) * 100;
    diffStr = (diffPct >= 0 ? '+' : '') + diffPct.toFixed(2) + '%';
    diffClass = diffPct > 0 ? 'price-diff-up' : diffPct < 0 ? 'price-diff-down' : 'price-diff-neutral';
  }

  return (
    <>
      <div className="price-row">
        <span className="price-label">Price to Beat</span>
        <span className="price-value">{fmt(ptb)}</span>
      </div>
      <div className="price-row">
        <span className="price-label">Current Price</span>
        <span className="price-value highlight">{fmt(curr)}</span>
      </div>
      <div className={`price-row ${diffClass}`}>
        <span className="price-label">vs Price to Beat</span>
        <span className="price-value">{diffStr}</span>
      </div>
    </>
  );
}
