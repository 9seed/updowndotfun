import { useStore } from '../store/useStore.js';
import { useT } from '../i18n.js';
import { ASSETS } from '../utils/market.js';

const POLYGON_SCAN_TX = 'https://polygonscan.com/tx/';

// ── Helper: format timestamp ──────────────────────────────────────────────────
function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts);
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ── Positions Tab ─────────────────────────────────────────────────────────────
function PositionsTab({ t }) {
  const positions = useStore((s) => s.positions);
  const openClaimModal = useStore((s) => s.openClaimModal);
  const openClaimAllModal = useStore((s) => s.openClaimAllModal);

  const active = (positions ?? []).filter((p) => !p.redeemable && (p.curPrice > 0 || (p.size ?? 0) > 0));
  const redeemable = (positions ?? []).filter((p) => p.redeemable && (p.currentValue ?? 0) > 0);
  const sorted = [...active].sort((a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0));

  return (
    <div>
      {/* Active positions table */}
      {sorted.length === 0 ? (
        <div className="portfolio-empty">{t.noPositions}</div>
      ) : (
        <div className="positions-scroll" style={{ maxHeight: '220px' }}>
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
                const title = (p.title ?? p.slug ?? '—').length > 34
                  ? (p.title ?? p.slug).slice(0, 34) + '…'
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
      )}

      {/* Claimable section */}
      {redeemable.length > 0 && (
        <div className="claimable-section">
          <div className="claimable-header">
            <div className="claimable-label" style={{ marginBottom: 0 }}>🎁 {t.redeemablePositions}</div>
            {redeemable.length > 1 && (
              <button className="claim-all-btn" onClick={() => openClaimAllModal(redeemable)}>
                {t.claimAllBtn(redeemable.length)}
              </button>
            )}
          </div>
          {redeemable.map((p, idx) => (
            <div key={idx} className="claimable-row">
              <div className="claimable-title" title={p.title ?? ''}>{p.title ?? p.slug ?? '—'}</div>
              <div className="claimable-value">${(p.currentValue ?? 0).toFixed(2)}</div>
              <button
                className="claim-btn"
                onClick={() => openClaimModal({
                  conditionId: p.conditionId ?? '',
                  outcomeIndex: p.outcomeIndex ?? 0,
                  title: p.title ?? p.slug ?? '',
                  value: p.currentValue ?? 0,
                })}
              >
                {t.claimBtn}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Trades Tab ────────────────────────────────────────────────────────────────
function TradesTab({ t, lang }) {
  const userTrades = useStore((s) => s.userTrades);

  if (!userTrades || userTrades.length === 0) {
    return <div className="portfolio-empty">{t.noTrades}</div>;
  }

  return (
    <div className="activity-scroll">
      <table className="activity-table">
        <thead>
          <tr>
            <th>{t.colTime}</th>
            <th>{t.colMarket}</th>
            <th>{t.colSide}</th>
            <th>{t.colShares}</th>
            <th>{t.colAvg}</th>
            <th>{t.colAmount}</th>
            <th>{t.colTx}</th>
          </tr>
        </thead>
        <tbody>
          {userTrades.map((a, idx) => {
            const isBuy = (a.side ?? '').toUpperCase() === 'BUY' || !a.side;
            const marketTitle = (a.title ?? a.slug ?? '—').length > 30
              ? (a.title ?? a.slug).slice(0, 30) + '…'
              : (a.title ?? a.slug ?? '—');
            const shares = a.size != null ? Number(a.size).toFixed(1) : '—';
            const avg = a.price != null ? `${(a.price * 100).toFixed(1)}¢` : '—';
            const amount = a.amount != null ? `$${Number(a.amount).toFixed(2)}` : '—';
            const txShort = a.transactionHash
              ? `${a.transactionHash.slice(0, 8)}…`
              : null;
            return (
              <tr key={idx}>
                <td className="activity-time">{fmtTime(a.timestamp ?? a.createdAt)}</td>
                <td className="activity-market" title={a.title ?? ''}>{marketTitle}</td>
                <td>
                  <span className={isBuy ? 'activity-buy' : 'activity-sell'}>
                    {isBuy ? t.tradeTypeBuy : t.tradeTypeSell}
                  </span>
                </td>
                <td className="pos-num">{shares}</td>
                <td className="pos-num muted">{avg}</td>
                <td className="pos-num">{amount}</td>
                <td className="activity-tx">
                  {txShort ? (
                    <a href={`${POLYGON_SCAN_TX}${a.transactionHash}`} target="_blank" rel="noreferrer">
                      {txShort}
                    </a>
                  ) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Settlement Tab ────────────────────────────────────────────────────────────
function SettlementTab({ t, lang }) {
  const userRedeems = useStore((s) => s.userRedeems);
  const historyCache = useStore((s) => s.historyCache);

  return (
    <div>
      {/* Redeem activity list */}
      {userRedeems && userRedeems.length > 0 ? (
        <div className="activity-scroll" style={{ maxHeight: '160px' }}>
          <table className="activity-table">
            <thead>
              <tr>
                <th>{t.colTime}</th>
                <th>{t.colMarket}</th>
                <th>{t.colAmount}</th>
                <th>{t.colTx}</th>
              </tr>
            </thead>
            <tbody>
              {userRedeems.map((a, idx) => {
                const marketTitle = (a.title ?? a.slug ?? '—').length > 32
                  ? (a.title ?? a.slug).slice(0, 32) + '…'
                  : (a.title ?? a.slug ?? '—');
                const amount = a.amount != null ? `$${Number(a.amount).toFixed(2)}` : '—';
                const txShort = a.transactionHash ? `${a.transactionHash.slice(0, 8)}…` : null;
                return (
                  <tr key={idx}>
                    <td className="activity-time">{fmtTime(a.timestamp ?? a.createdAt)}</td>
                    <td className="activity-market" title={a.title ?? ''}>{marketTitle}</td>
                    <td className="pos-num activity-redeem">{amount}</td>
                    <td className="activity-tx">
                      {txShort ? (
                        <a href={`${POLYGON_SCAN_TX}${a.transactionHash}`} target="_blank" rel="noreferrer">
                          {txShort}
                        </a>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="portfolio-empty">{t.noRedeems}</div>
      )}

      {/* Asset settlement arrows from historyCache */}
      <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.4rem', padding: '0 0.25rem' }}>
          {t.assetSettlement}
        </div>
        <div className="portfolio-settlement-grid">
          {ASSETS.map((asset) => {
            const records = historyCache[asset] ?? [];
            if (records.length === 0) return null;
            return (
              <div key={asset} className="portfolio-settlement-asset">
                <span className="portfolio-settlement-asset-label">{asset.toUpperCase()}</span>
                <div className="portfolio-settlement-arrows">
                  {records.map((r, i) => {
                    let arrow = '·';
                    let cls = 'muted';
                    if (r.result === 'up') { arrow = '↑'; cls = 'up'; }
                    else if (r.result === 'down') { arrow = '↓'; cls = 'down'; }
                    const ts = new Date(r.ts * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                    return (
                      <span
                        key={i}
                        className={cls}
                        title={`${ts} ${r.result ?? '?'}`}
                        style={{ fontSize: '0.85rem', cursor: 'default' }}
                      >
                        {arrow}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── PortfolioPanel ────────────────────────────────────────────────────────────
export default function PortfolioPanel() {
  const lang = useStore((s) => s.lang);
  const userAddress = useStore((s) => s.userAddress);
  const portfolioTab = useStore((s) => s.portfolioTab);
  const setPortfolioTab = useStore((s) => s.setPortfolioTab);
  const t = useT(lang);

  if (!userAddress) {
    return (
      <div className="portfolio-section">
        <div className="portfolio-empty muted">{t.noAddress}</div>
      </div>
    );
  }

  const tabs = [
    { key: 'positions', label: t.tabPositions },
    { key: 'trades', label: t.tabTrades },
    { key: 'settlement', label: t.tabSettlement },
  ];

  return (
    <div className="portfolio-section">
      <div className="portfolio-tabs">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            className={`portfolio-tab-btn${portfolioTab === key ? ' active' : ''}`}
            onClick={() => setPortfolioTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="portfolio-tab-content">
        {portfolioTab === 'positions' && <PositionsTab t={t} />}
        {portfolioTab === 'trades' && <TradesTab t={t} lang={lang} />}
        {portfolioTab === 'settlement' && <SettlementTab t={t} lang={lang} />}
      </div>
    </div>
  );
}
