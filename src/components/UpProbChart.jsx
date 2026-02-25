import { useStore } from '../store/useStore.js';
import { useT } from '../i18n.js';

const CHART_WIDTH = 320;
const CHART_HEIGHT = 140;
const CHART_PAD = { top: 8, right: 8, bottom: 28, left: 40 };

function timeLabel(ts) {
  const d = new Date(ts * 1000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export default function UpProbChart({ asset, windowTs }) {
  const lang = useStore((s) => s.lang);
  const points = useStore((s) => s.tradeHistory[asset]) ?? [];
  const t = useT(lang);

  const now = Date.now();
  const windowStart = windowTs * 1000;
  const windowEnd = (windowTs + 300) * 1000;
  const tMin = windowStart;
  let tMax = Math.min(windowEnd, Math.max(now, windowStart));
  if (tMax <= tMin) tMax = tMin + 60000;

  const w = CHART_WIDTH - CHART_PAD.left - CHART_PAD.right;
  const h = CHART_HEIGHT - CHART_PAD.top - CHART_PAD.bottom;
  const toX = (t) => CHART_PAD.left + ((t - tMin) / (tMax - tMin || 1)) * w;
  const toY = (p) => CHART_PAD.top + h - p * h;

  const xTicks = [];
  for (let i = 0; i <= 5; i++) {
    const ts = windowTs + i * 60;
    if (ts * 1000 <= tMax) xTicks.push({ t: ts * 1000, label: timeLabel(ts) });
  }
  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  let pathD = '';
  if (points.length >= 2) {
    const filtered = points.filter((p) => p.time >= tMin && p.time <= tMax);
    pathD = filtered
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.time).toFixed(1)} ${toY(p.upProb).toFixed(1)}`)
      .join(' ');
  }

  return (
    <div className="chart-container">
      <div className="chart-title muted">{t.upChart}</div>
      <svg
        className="chart-svg"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id={`chartGrad-${asset}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="var(--cyan)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--cyan)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.slice(1, -1).map((p) => (
          <line key={p} x1={CHART_PAD.left} y1={toY(p)} x2={CHART_PAD.left + w} y2={toY(p)} className="chart-grid" />
        ))}
        {xTicks.slice(1, -1).map(({ t: ts }) => (
          <line key={ts} x1={toX(ts)} y1={CHART_PAD.top} x2={toX(ts)} y2={CHART_PAD.top + h} className="chart-grid" />
        ))}
        <rect x={CHART_PAD.left} y={CHART_PAD.top} width={w} height={h} fill={`url(#chartGrad-${asset})`} />
        {pathD && (
          <path d={pathD} fill="none" stroke="var(--cyan)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {yTicks.map((p) => (
          <text key={p} x={CHART_PAD.left - 6} y={toY(p) + 4} className="chart-axis-text" textAnchor="end">
            {Math.round(p * 100)}%
          </text>
        ))}
        {xTicks.map(({ t: ts, label }) => (
          <text key={ts} x={toX(ts)} y={CHART_HEIGHT - 6} className="chart-axis-text" textAnchor="middle">
            {label}
          </text>
        ))}
      </svg>
    </div>
  );
}
