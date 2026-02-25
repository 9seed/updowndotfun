import { useStore } from '../store/useStore.js';
import { useT } from '../i18n.js';

export default function SettlementHistory({ asset }) {
  const lang = useStore((s) => s.lang);
  const records = useStore((s) => s.historyCache[asset]) ?? [];
  const t = useT(lang);

  if (!records || records.length === 0) return null;

  return (
    <div className="settlement-history">
      <span className="settlement-label">{t.historyLabel}</span>
      {records.map(({ ts, result }) => {
        const cls = result === 'up' ? 'settle-up' : result === 'down' ? 'settle-down' : 'settle-pending';
        const arrow = result === 'up' ? '▲' : result === 'down' ? '▼' : '·';
        const d = new Date(ts * 1000);
        const endD = new Date((ts + 300) * 1000);
        const fmt = (t) => t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = d.toLocaleDateString([], { month: '2-digit', day: '2-digit' });
        const tipLabel = result === 'up' ? '↑' : '↓';
        const tooltip = `${dateStr} ${fmt(d)}-${fmt(endD)} ${tipLabel}`;
        return (
          <span key={ts} className={`settle-dot ${cls}`} title={tooltip}>
            {arrow}
          </span>
        );
      })}
    </div>
  );
}
