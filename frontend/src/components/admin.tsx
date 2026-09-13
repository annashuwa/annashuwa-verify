import { ReactNode } from 'react';
import { kobo } from '../lib/api';
import { Badge, Button, EmptyState, ErrorState, Skeleton } from './kit';

/* ---------- formatting ---------- */
export function fmtDateTime(v?: string | Date | null): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function fmtDate(v?: string | Date | null): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function timeAgo(v?: string | Date | null): string {
  if (!v) return '—';
  const ms = Date.now() - new Date(v).getTime();
  if (Number.isNaN(ms)) return '—';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return fmtDate(v);
}
export { kobo };

/* ---------- page header + breadcrumb ---------- */
export function AdminPageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-ink-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/* ---------- stat card ---------- */
const TONES: Record<string, string> = {
  brand: 'bg-brand-50 text-brand-700',
  gold: 'bg-gold-50 text-gold-700',
  green: 'bg-emerald-50 text-emerald-700',
  red: 'bg-red-50 text-red-700',
  amber: 'bg-amber-50 text-amber-700',
  indigo: 'bg-indigo-50 text-indigo-700',
  slate: 'bg-mist-100 text-ink-600',
};
export function StatCard({ icon, label, value, sub, tone = 'brand' }: {
  icon: ReactNode; label: string; value: string; sub?: string; tone?: keyof typeof TONES | string;
}) {
  // Long values (large ₦ amounts) step down so money fits narrow cards.
  // Pairs are mobile/desktop: 2-col mobile cards are narrower than 5-col desktop.
  // Ellipsis + native tooltip remain as a backstop for extremes.
  const len = value.length;
  const sizeCls = len > 14 ? 'text-sm sm:text-base' : len > 10 ? 'text-sm sm:text-lg' : len > 8 ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl';
  return (
    <div className="card p-3 sm:p-5 flex gap-3 sm:gap-3.5 items-start min-w-0">
      <span className={`grid place-items-center w-10 h-10 rounded-xl shrink-0 ${TONES[tone] ?? TONES.brand}`} aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.72rem] font-bold uppercase tracking-wider text-ink-500 leading-snug">{label}</span>
        <span className={`block ${sizeCls} font-extrabold tnum tracking-tight leading-tight whitespace-nowrap overflow-hidden text-ellipsis`} title={value}>{value}</span>
        {sub && <span className="block text-xs text-ink-500 mt-0.5 leading-snug">{sub}</span>}
      </span>
    </div>
  );
}

/* ---------- chart card ---------- */
export function ChartCard({ title, subtitle, action, children, className = '' }: {
  title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`card p-4 sm:p-5 min-w-0 ${className}`} aria-label={title}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h2 className="font-bold truncate">{title}</h2>
          {subtitle && <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ---------- SVG area chart (pure, no deps) ---------- */
export function AreaChart({ points, height = 180, formatY }: {
  points: { label: string; value: number }[]; height?: number; formatY?: (v: number) => string;
}) {
  const W = 600;
  const H = height;
  const PAD = 8;
  if (points.length === 0) return <p className="text-sm text-ink-500 py-6 text-center">No data in this period.</p>;
  const max = Math.max(1, ...points.map((p) => p.value));
  const stepX = points.length === 1 ? 0 : (W - PAD * 2) / (points.length - 1);
  const xy = points.map((p, i) => ({
    x: PAD + i * stepX,
    y: H - PAD - ((p.value / max) * (H - PAD * 2)),
    ...p,
  }));
  const line = xy.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${xy[xy.length - 1].x.toFixed(1)},${H} L${xy[0].x.toFixed(1)},${H} Z`;
  const fy = formatY ?? ((v: number) => String(Math.round(v)));
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} role="img" aria-label="Trend chart">
        <defs>
          <linearGradient id="adming" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14724c" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#14724c" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={PAD} x2={W - PAD} y1={H * f} y2={H * f} stroke="#eaecf0" strokeDasharray="3 4" />
        ))}
        <path d={area} fill="url(#adming)" />
        <path d={line} fill="none" stroke="#14724c" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {xy.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#fff" stroke="#14724c" strokeWidth="2">
            <title>{p.label}: {fy(p.value)}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between text-[0.68rem] text-ink-500 mt-1">
        <span>{xy[0].label}</span>
        <span className="tnum font-bold text-ink-700">max {fy(max)}</span>
        <span>{xy[xy.length - 1].label}</span>
      </div>
    </div>
  );
}

/* ---------- SVG donut ---------- */
export function Donut({ segments, size = 170 }: {
  segments: { label: string; value: number; color: string }[]; size?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <p className="text-sm text-ink-500 py-6 text-center">No data yet.</p>;
  const R = 62;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <svg width={size} height={size} viewBox="0 0 160 160" role="img" aria-label="Status distribution" className="shrink-0">
        <circle cx="80" cy="80" r={R} fill="none" stroke="#f2f4f7" strokeWidth="20" />
        {segments.map((s, i) => {
          const frac = s.value / total;
          const dash = `${(frac * C).toFixed(1)} ${(C - frac * C).toFixed(1)}`;
          const rot = (acc / total) * 360;
          acc += s.value;
          return <circle key={i} cx="80" cy="80" r={R} fill="none" stroke={s.color} strokeWidth="20" strokeDasharray={dash} transform={`rotate(${-90 + rot} 80 80)`}><title>{s.label}: {s.value}</title></circle>;
        })}
        <text x="80" y="76" textAnchor="middle" fontSize="24" fontWeight="800" fill="#101828">{total}</text>
        <text x="80" y="94" textAnchor="middle" fontSize="11" fill="#667085">total</text>
      </svg>
      <ul className="space-y-1.5 text-sm w-full min-w-0">
        {segments.map((s, i) => (
          <li key={i} className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} aria-hidden="true" />
            <span className="text-ink-600 truncate flex-1">{s.label}</span>
            <b className="tnum">{s.value}</b>
            <span className="text-xs text-ink-500 tnum w-11 text-right">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- horizontal bars ---------- */
export function HBars({ rows, maxRows = 8, money = false }: {
  rows: { label: string; value: number; sub?: string }[]; maxRows?: number; money?: boolean;
}) {
  const list = rows.slice(0, maxRows);
  if (list.length === 0) return <p className="text-sm text-ink-500 py-6 text-center">No data yet.</p>;
  const max = Math.max(1, ...list.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {list.map((r, i) => (
        <li key={i} className="min-w-0">
          <div className="flex justify-between gap-2 text-sm mb-1">
            <span className="font-semibold truncate">{r.label}</span>
            <span className="tnum shrink-0">{money ? kobo(r.value) : r.value.toLocaleString()}{r.sub ? <span className="text-xs text-ink-500 font-medium"> · {r.sub}</span> : null}</span>
          </div>
          <div className="h-2 rounded-full bg-mist-100 overflow-hidden" role="img" aria-label={`${r.label}: ${r.value}`}>
            <div className="h-full rounded-full bg-gradient-to-r from-brand-700 to-brand-400" style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------- detail rows ---------- */
export function DetailGrid({ items }: { items: { label: string; value: ReactNode; span?: boolean }[] }) {
  return (
    <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
      {items.map((it, i) => (
        <div key={i} className={it.span ? 'sm:col-span-2' : 'min-w-0'}>
          <dt className="text-[0.7rem] font-bold uppercase tracking-wider text-ink-500">{it.label}</dt>
          <dd className="mt-0.5 font-medium break-words">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------- section title ---------- */
export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mt-6 mb-2.5 first:mt-0">
      <h2 className="font-bold">{title}</h2>
      {action}
    </div>
  );
}

/* ---------- filter bar ---------- */
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2 mb-4 items-center">{children}</div>;
}

/* ---------- re-export shared states ---------- */
export { Badge, Button, EmptyState, ErrorState, Skeleton };
