import { ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Loader2, Copy, Check, Inbox, AlertTriangle, X, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { kobo } from '../lib/api';

/* ================= Brand ================= */
export function Logo({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
        <rect width="32" height="32" rx="9" fill={dark ? '#ffffff' : '#071f13'} />
        <path d="M9 22V10l7 8 7-8v12" stroke="#12b76a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="23.5" cy="22.5" r="2.4" fill="#c9a227" />
      </svg>
      {!compact && (
        <span className={`text-[1.15rem] font-extrabold tracking-tight ${dark ? 'text-white' : 'text-ink-900'}`}>
          Naija<span className="text-brand-600">Verify</span>
        </span>
      )}
    </span>
  );
}

/* ================= Buttons / fields ================= */
type BtnVariant = 'primary' | 'ghost' | 'soft' | 'danger';

export function Button({
  variant = 'primary', size, loading, icon, children, className = '', ...rest
}: {
  variant?: BtnVariant; size?: 'sm'; loading?: boolean; icon?: ReactNode;
  children: ReactNode; className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = variant === 'primary' ? 'btn-primary' : variant === 'ghost' ? 'btn-ghost' : variant === 'soft' ? 'btn-soft' : 'btn-danger';
  return (
    <button className={`${cls} ${size === 'sm' ? 'btn-sm' : ''} ${className}`} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

export function Field({
  label, children, hint, error, htmlFor,
}: { label: string; children: ReactNode; hint?: string; error?: string; htmlFor?: string }) {
  return (
    <div className="mb-4">
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <p className="field-error" role="alert">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

/* ================= Page header ================= */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5 page-in">
      <div>
        <h1 className="text-[1.5rem] font-extrabold tracking-tight text-ink-900">{title}</h1>
        {subtitle && <p className="text-sm text-ink-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/* ================= Status badge ================= */
const STATUS_STYLE: Record<string, { bg: string; fg: string; border: string; dot?: boolean }> = {
  successful: { bg: '#ecfbf2', fg: '#0f7a40', border: '#c8ecd5', dot: true },
  active: { bg: '#ecfbf2', fg: '#0f7a40', border: '#c8ecd5', dot: true },
  online: { bg: '#ecfbf2', fg: '#0f7a40', border: '#c8ecd5', dot: true },
  paid: { bg: '#ecfbf2', fg: '#0f7a40', border: '#c8ecd5', dot: true },
  completed: { bg: '#ecfbf2', fg: '#0f7a40', border: '#c8ecd5', dot: true },
  resolved: { bg: '#ecfbf2', fg: '#0f7a40', border: '#c8ecd5', dot: true },
  failed: { bg: '#fef0ef', fg: '#b42318', border: '#f6cfcb', dot: true },
  offline: { bg: '#fef0ef', fg: '#b42318', border: '#f6cfcb', dot: true },
  refunded: { bg: '#fef7e8', fg: '#8f4d0a', border: '#f3e2ae', dot: true },
  reversed: { bg: '#fef7e8', fg: '#8f4d0a', border: '#f3e2ae', dot: true },
  maintenance: { bg: '#fff1e5', fg: '#9a3412', border: '#f5cf9f', dot: true },
  degraded: { bg: '#fff1e5', fg: '#9a3412', border: '#f5cf9f', dot: true },
  pending: { bg: '#fff1e5', fg: '#9a3412', border: '#f5cf9f', dot: true },
  processing: { bg: '#fff1e5', fg: '#9a3412', border: '#f5cf9f', dot: true },
  refund_pending: { bg: '#fff1e5', fg: '#9a3412', border: '#f5cf9f', dot: true },
  open: { bg: '#eef6fe', fg: '#144ca0', border: '#c4ddf8', dot: true },
};

export function Badge({ status, children }: { status?: string; children?: ReactNode }) {
  const s = STATUS_STYLE[status || ''] || { bg: '#f2f4f7', fg: '#344054', border: '#e4e7ec' };
  return (
    <span className="badge" style={{ background: s.bg, color: s.fg, borderColor: s.border }}>
      {s.dot && <span className="dot" aria-hidden="true" />}
      {(children ?? status ?? '').toString().replace(/_/g, ' ').toUpperCase()}
    </span>
  );
}

/* ================= Stat card ================= */
export function Stat({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="card card-hover p-4 sm:p-5 flex items-center gap-3.5">
      <span className="grid place-items-center w-11 h-11 rounded-xl bg-brand-50 text-brand-700 border border-brand-100 shrink-0" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[0.76rem] font-medium text-ink-500 truncate">{label}</span>
        <span className="block text-[1.3rem] leading-8 font-extrabold tracking-tight tnum truncate">{value}</span>
        {sub && <span className="block text-xs text-ink-500 truncate">{sub}</span>}
      </span>
    </div>
  );
}

/* ================= Skeletons ================= */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}
export function SkeletonCards({ n = 3 }: { n?: number }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-label="Loading">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="card p-5 space-y-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}
export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="table-wrap p-4 space-y-3" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

/* ================= Empty / error states ================= */
export function EmptyState({
  icon = <Inbox size={28} />, title, body, action,
}: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="card p-8 sm:p-10 text-center">
      <span className="mx-auto mb-3 grid place-items-center w-12 h-12 rounded-2xl bg-mist-50 text-ink-500 border border-mist-200" aria-hidden="true">
        {icon}
      </span>
      <h3 className="font-bold text-ink-900">{title}</h3>
      {body && <p className="text-sm text-ink-500 mt-1 max-w-sm mx-auto">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card p-8 text-center border-red-200" role="alert">
      <span className="mx-auto mb-3 grid place-items-center w-12 h-12 rounded-2xl bg-red-50 text-red-700" aria-hidden="true">
        <AlertTriangle size={26} />
      </span>
      <h3 className="font-bold">Something went wrong</h3>
      <p className="text-sm text-ink-500 mt-1">{message}</p>
      {onRetry && (
        <div className="mt-4 flex justify-center">
          <Button variant="ghost" size="sm" onClick={onRetry}>Try again</Button>
        </div>
      )}
    </div>
  );
}

export function InlineError({ error }: { error: any }) {
  if (!error) return null;
  return (
    <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 px-4 py-3 mb-4 text-sm flex gap-2.5" role="alert">
      <AlertTriangle size={17} className="shrink-0 mt-0.5" aria-hidden="true" />
      <span>{friendlyError(error)}</span>
    </div>
  );
}

export function friendlyError(e: any): string {
  const msg = String(e?.body?.message || e?.message || 'Request failed');
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'Network error — check your connection and try again.';
  return msg;
}

/* ================= Toast (event-based) ================= */
type ToastKind = 'success' | 'error' | 'info';
interface ToastItem { id: number; msg: string; kind: ToastKind }
let toastId = 0;

export function toast(msg: string, kind: ToastKind = 'success') {
  window.dispatchEvent(new CustomEvent<ToastItem>('nv:toast', { detail: { id: ++toastId, msg, kind } }));
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<ToastItem>).detail;
      setItems((prev) => [...prev.slice(-3), t]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 4200);
    };
    window.addEventListener('nv:toast', on);
    return () => window.removeEventListener('nv:toast', on);
  }, []);
  return (
    <div className="fixed bottom-20 lg:bottom-6 right-4 z-[100] flex flex-col gap-2 max-w-[calc(100vw-2rem)]" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className="toast-item flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium shadow-lg border"
          style={
            t.kind === 'success'
              ? { background: '#06291c', color: '#fff', borderColor: '#0f5a3d' }
              : t.kind === 'error'
                ? { background: '#7a271a', color: '#fff', borderColor: '#912018' }
                : { background: '#fff', color: '#0f172a', borderColor: '#d7ded9' }
          }
        >
          {t.kind === 'success' ? <Check size={16} /> : t.kind === 'error' ? <X size={16} /> : null}
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

/* ================= Confirm + prompt dialogs ================= */
interface ConfirmReq {
  title: string; body?: string; confirmLabel?: string; danger?: boolean;
  resolve: (v: boolean) => void;
}
interface PromptReq {
  title: string; label?: string; initial?: string; inputType?: string;
  resolve: (v: string | null) => void;
}

export function confirmDialog(opts: { title: string; body?: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent<ConfirmReq>('nv:confirm', { detail: { ...opts, resolve } }));
  });
}

export function promptDialog(opts: { title: string; label?: string; initial?: string; inputType?: string }): Promise<string | null> {
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent<PromptReq>('nv:prompt', { detail: { ...opts, resolve } }));
  });
}

export function DialogHost() {
  const [confirm, setConfirm] = useState<ConfirmReq | null>(null);
  const [prompt, setPrompt] = useState<PromptReq | null>(null);
  const [promptVal, setPromptVal] = useState('');
  useEffect(() => {
    const onC = (e: Event) => setConfirm((e as CustomEvent<ConfirmReq>).detail);
    const onP = (e: Event) => {
      const d = (e as CustomEvent<PromptReq>).detail;
      setPromptVal(d.initial || '');
      setPrompt(d);
    };
    window.addEventListener('nv:confirm', onC);
    window.addEventListener('nv:prompt', onP);
    return () => {
      window.removeEventListener('nv:confirm', onC);
      window.removeEventListener('nv:prompt', onP);
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (prompt) { prompt.resolve(null); setPrompt(null); }
        if (confirm) { confirm.resolve(false); setConfirm(null); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prompt, confirm]);

  return (
    <>
      {confirm && (
        <div className="fixed inset-0 z-[90] grid place-items-center p-4 bg-black/45 backdrop-blur-sm" onClick={() => { confirm.resolve(false); setConfirm(null); }} role="presentation">
          <div className="modal-panel card w-full max-w-sm p-6" role="alertdialog" aria-modal="true" aria-label={confirm.title} onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg">{confirm.title}</h3>
            {confirm.body && <p className="text-sm text-ink-500 mt-1.5">{confirm.body}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="ghost" size="sm" onClick={() => { confirm.resolve(false); setConfirm(null); }}>Cancel</Button>
              <Button variant={confirm.danger ? 'danger' : 'primary'} size="sm" onClick={() => { confirm.resolve(true); setConfirm(null); }}>
                {confirm.confirmLabel || 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
      {prompt && (
        <div className="fixed inset-0 z-[90] grid place-items-center p-4 bg-black/45 backdrop-blur-sm" onClick={() => { prompt.resolve(null); setPrompt(null); }} role="presentation">
          <form
            className="modal-panel card w-full max-w-sm p-6"
            role="dialog" aria-modal="true" aria-label={prompt.title}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); prompt.resolve(promptVal); setPrompt(null); }}
          >
            <h3 className="font-bold text-lg">{prompt.title}</h3>
            {prompt.label && <div className="mt-3"><Field label={prompt.label}><input autoFocus className="input" type={prompt.inputType || 'text'} value={promptVal} onChange={(e) => setPromptVal(e.target.value)} /></Field></div>}
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" size="sm" type="button" onClick={() => { prompt.resolve(null); setPrompt(null); }}>Cancel</Button>
              <Button size="sm" type="submit">Save</Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

/* ================= Tabs / pagination / avatar / copy ================= */
export function Tabs({ options, value, onChange }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto strip-scroll pb-1" role="tablist" aria-label="Filters">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`shrink-0 rounded-full px-4 py-2 text-[0.83rem] font-semibold border min-h-[38px] transition-all ${
            value === o.value
              ? 'bg-brand-900 text-white border-brand-900 shadow-sm'
              : 'bg-white text-ink-700 border-mist-200 hover:border-brand-300 hover:bg-mist-25'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (!pages || pages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-4">
      <p className="text-xs text-ink-500">Page {page} of {pages}</p>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" icon={<ChevronLeft size={15} />} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">Prev</Button>
        <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page">Next<ChevronRight size={15} /></Button>
      </div>
    </div>
  );
}

const AVATAR_HUES = ['#14724c', '#1f64c5', '#8f4d0a', '#5b3ea8', '#0e7490', '#b42318'];
export function Avatar({ name, size = 38 }: { name?: string; size?: number }) {
  const initials = String(name || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
  let h = 0;
  for (const c of String(name || '')) h = (h * 31 + c.charCodeAt(0)) % 997;
  const bg = AVATAR_HUES[h % AVATAR_HUES.length];
  return (
    <span
      className="grid place-items-center rounded-full text-white font-bold shrink-0"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost btn-sm"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
      {done ? 'Copied' : label}
    </button>
  );
}

/* ================= Fintech cards ================= */
export function WalletCard({
  balance, sub, onFund, onView, compact,
}: { balance: string; sub?: string; onFund?: () => void; onView?: () => void; compact?: boolean }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 sm:p-6 text-white min-h-[168px]"
      style={{ background: 'linear-gradient(140deg, #0a3f2a 0%, #06291c 55%, #031810 100%)' }}
    >
      <div className="absolute inset-0 hero-grid" aria-hidden="true" />
      <div className="absolute -right-10 -top-16 w-56 h-56 rounded-full" style={{ background: 'radial-gradient(circle, rgba(31,138,93,0.5) 0%, transparent 70%)' }} aria-hidden="true" />
      <div className="absolute right-6 bottom-4 font-extrabold text-white/10 text-4xl select-none" aria-hidden="true">₦</div>
      <p className="relative text-[0.76rem] font-semibold uppercase tracking-[0.1em] text-white/60">Available balance</p>
      <p className={`relative font-extrabold tracking-tight tnum mt-1 ${compact ? 'text-3xl' : 'text-4xl'}`}>{balance}</p>
      {sub && <p className="relative text-xs text-white/60 mt-1">{sub}</p>}
      {(onFund || onView) && (
        <div className="relative flex flex-wrap gap-2 mt-4">
          {onFund && (
            <button onClick={onFund} className="rounded-xl bg-white text-brand-900 font-bold text-sm px-4 py-2.5 min-h-[42px] hover:bg-brand-50 transition-colors shadow-sm">
              Fund wallet
            </button>
          )}
          {onView && (
            <Link to="/app/wallet" onClick={onView as any} className="rounded-xl border border-white/25 text-white font-semibold text-sm px-4 py-2.5 min-h-[42px] hover:bg-white/10 transition-colors">
              View wallet
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export function ServiceIcon({ category }: { category: string }) {
  return (
    <span className="grid place-items-center w-11 h-11 rounded-xl bg-brand-900 text-gold-300 shrink-0" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {category === 'identity' ? <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1.2-3.4 4-5 7-5s5.8 1.6 7 5" /></>
          : category === 'business' ? <><rect x="4" y="7" width="16" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M4 12h16" /></>
            : category === 'education' ? <><path d="M12 4 2 9l10 5 10-5-10-5Z" /><path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5" /></>
              : <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>}
      </svg>
    </span>
  );
}

export function ServiceCard({ to, name, description, category, price, cta = 'Verify now' }: {
  to: string; name: string; description: string; category: string; price: string; cta?: string;
}) {
  return (
    <Link to={to} className="card card-hover p-5 flex flex-col gap-3 group" aria-label={`${name} — ${price}`}>
      <div className="flex items-start justify-between gap-3">
        <ServiceIcon category={category} />
        <Badge status="active">{category}</Badge>
      </div>
      <div>
        <h3 className="font-bold text-[1.02rem] group-hover:text-brand-700 transition-colors">{name}</h3>
        <p className="text-sm text-ink-500 mt-1 line-clamp-2">{description}</p>
      </div>
      <div className="mt-auto flex items-center justify-between pt-1">
        <p className="font-extrabold text-brand-700 tnum">{price}</p>
        <span className="btn-soft btn-sm">{cta}</span>
      </div>
    </Link>
  );
}

/* Responsive transaction list: table on desktop, cards on mobile */
export interface TxRow { txId: string; serviceSlug: string; status: string; amountKobo: number; createdAt: string; providerCode?: string }
export function TxList({ items, linkPrefix }: { items: TxRow[]; linkPrefix: string }) {
  return (
    <>
      <div className="table-wrap hidden md:block">
        <table className="data">
          <thead><tr><th>Transaction</th><th>Service</th><th>Status</th><th className="text-right">Amount</th></tr></thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.txId}>
                <td>
                  <Link to={`${linkPrefix}/${t.txId}`} className="font-mono text-[0.8rem] text-brand-700 font-semibold hover:underline">{t.txId}</Link>
                  <span className="block text-xs text-ink-500">{new Date(t.createdAt).toLocaleString()}</span>
                </td>
                <td className="font-medium">{t.serviceSlug}</td>
                <td><Badge status={t.status} /></td>
                <td className="text-right font-bold tnum">{kobo(t.amountKobo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="md:hidden space-y-2.5">
        {items.map((t) => (
          <Link key={t.txId} to={`${linkPrefix}/${t.txId}`} className="card card-hover p-4 flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-sm truncate">{t.serviceSlug}</span>
              <span className="block font-mono text-xs text-ink-500 truncate">{t.txId}</span>
              <span className="block text-xs text-ink-500">{new Date(t.createdAt).toLocaleDateString()}</span>
            </span>
            <span className="text-right shrink-0">
              <span className="block font-extrabold tnum text-[0.95rem]">{kobo(t.amountKobo)}</span>
              <Badge status={t.status} />
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}