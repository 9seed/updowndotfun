import { useStore } from '../store/useStore.js';
import { useT } from '../i18n.js';
import { windowLabel, statusBadge, statusClass, panelClass } from '../utils/market.js';
import PriceSection from './PriceSection.jsx';
import TimeProgress from './TimeProgress.jsx';
import SettlementHistory from './SettlementHistory.jsx';
import OrderBook from './OrderBook.jsx';
import TradeBox from './TradeBox.jsx';
import UpProbChart from './UpProbChart.jsx';

export default function MarketPanel({ asset, windowTs }) {
  const lang = useStore((s) => s.lang);
  const market = useStore((s) => s.marketsCache[asset]?.[windowTs]);
  const t = useT(lang);

  const slug = `${asset}-updown-5m-${windowTs}`;
  const label = windowLabel(windowTs);

  if (market === undefined || market === null) {
    return (
      <div className="panel panel-dim">
        <div className="panel-header">
          <span className="badge status-dim">NOT FOUND</span>
          <span className="panel-subtitle">{label}</span>
        </div>
        <div className="panel-body">
          <div className="slug muted">slug: {slug}</div>
          <div className="muted">{t.marketNotFound}</div>
        </div>
      </div>
    );
  }

  const badge = statusBadge(market);
  const badgeClass = statusClass(market);
  const pClass = panelClass(market);
  const canTrade = market.active && !market.closed && market.accepting_orders;

  return (
    <div className={`panel ${pClass}`}>
      <div className="panel-header">
        <span className={`badge ${badgeClass}`}>{badge}</span>
        <span className="panel-subtitle">{label}</span>
      </div>
      <div className="panel-body">
        <div className="question">{market.question}</div>

        <PriceSection market={market} />

        <div className="slug muted">Slug: {slug}</div>

        <TimeProgress windowTs={windowTs} />

        <SettlementHistory asset={asset} />

        <div className="section-title">{t.orderBook}</div>
        {market.outcomes.map((outcome, i) => {
          const tokenId = market.token_ids?.[i];
          if (!tokenId) return null;
          return (
            <div key={tokenId}>
              <OrderBook tokenId={tokenId} outcome={outcome} />
              <TradeBox tokenId={tokenId} outcome={outcome} canTrade={canTrade} />
            </div>
          );
        })}

        <UpProbChart asset={asset} windowTs={windowTs} />
      </div>
    </div>
  );
}
