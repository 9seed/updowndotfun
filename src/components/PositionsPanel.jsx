import { useStore } from '../store/useStore.js';
import { useT } from '../i18n.js';

export default function PositionsPanel() {
  const lang = useStore((s) => s.lang);
  const userAddress = useStore((s) => s.userAddress);
  const positions = useStore((s) => s.positions);
  const t = useT(lang);

  if (!userAddress) {
    return (
      <div className="positions-section">
        <div className="positions-empty muted">{t.noAddress}</div>
      </div>
    );
  }

  // Only show active positions (not redeemable, has current price)
  const active = (positions ?? []).filter((p) => !p.redeemable && p.curPrice > 0);

  if (active.length === 0) {
    return (
      <div className="positions-section">
        <div className="positions-empty muted">{t.noPositions}</div>
      </div>
    );
  }

  const sorted = [...active].sort((a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0));

  return (
    <div className="positions-section">
      <div className="positions-header">
        {t.activePositions}{' '}
        <span className="muted">({t.records(sorted.length)})</span>
      </div>
      <div className="positions-scroll">
        <table className="positions-table">
          <thead>
            <tr>
              <th>{t.colMarket}</th>
              <th>{t.colSide}</th>
              <th>{t.colShares}</th>
              <th>{t.colAvg}</th>
              <th>{t.colCur}</th>
              <th>{t.colVal}</th>
              <th>{t.colPnl}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, idx) => {
              const outcome = p.outcome ?? '—';
              const outcomeClass = outcome.toLowerCase().includes('up') || outcome.toLowerCase().includes('yes') ? 'up' : 'down';
              const size = (p.size ?? 0).toFixed(0);
              const avgPct = p.avgPrice != null ? `${(p.avgPrice * 100).toFixed(1)}¢` : '—';
              const curPct = p.curPrice != null && p.curPrice > 0 ? `${(p.curPrice * 100).toFixed(1)}¢` : '—';
              const curVal = p.currentValue != null ? `$${p.currentValue.toFixed(2)}` : '—';
              const pnl = p.cashPnl ?? 0;
              const pnlPct = p.percentPnl ?? 0;
              const pnlStr = `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)`;
              const pnlClass = pnl > 0 ? 'pos-pnl-up' : pnl < 0 ? 'pos-pnl-down' : '';
              const title = (p.title ?? p.slug ?? '—').length > 36
                ? (p.title ?? p.slug).slice(0, 36) + '…'
                : (p.title ?? p.slug ?? '—');

              return (
                <tr key={idx} className="pos-row">
                  <td className="pos-title" title={p.title ?? ''}>{title}</td>
                  <td><span className={`outcome-name ${outcomeClass}`}>{outcome}</span></td>
                  <td className="pos-num">{size}</td>
                  <td className="pos-num muted">{avgPct}</td>
                  <td className="pos-num muted">{curPct}</td>
                  <td className="pos-num">{curVal}</td>
                  <td className={`pos-num ${pnlClass}`}>{pnlStr}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
