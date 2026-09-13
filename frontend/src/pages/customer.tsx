import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Fingerprint, Search, Wallet as WalletIcon, History, KeyRound, LifeBuoy,
  ArrowUpRight, ArrowDownLeft, Landmark, Printer, ChevronRight, ChevronLeft, ShieldCheck,
  Clock, CircleCheck, XCircle, Layers, Plus, ArrowRight, Sparkles,
} from 'lucide-react';
import { api, kobo } from '../lib/api';
import { useUser } from '../components/ui';
import {
  PageHeader, Stat, Badge, Button, Field, WalletCard, ServiceCard, ServiceIcon,
  TxList, Tabs, Pagination, EmptyState, ErrorState, InlineError,
  SkeletonCards, SkeletonTable, Skeleton, CopyButton, toast,
} from '../components/kit';

/* ================= Dashboard ================= */
export function Dashboard() {
  const [user] = useUser();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  const [notifs, setNotifs] = useState<any[]>([]);
  const nav = useNavigate();

  useEffect(() => {
    api('/api/dashboard/summary').then(setData).catch(setError);
    api('/api/notifications').then((r) => setNotifs(r.data.slice(0, 4))).catch(() => {});
  }, []);

  if (error) return <div className="page-in"><PageHeader title="Dashboard" /><ErrorState message={String(error.body?.message || error.message)} onRetry={() => location.reload()} /></div>;
  if (!data) {
    return (
      <div className="page-in">
        <Skeleton className="h-8 w-56 mb-5" />
        <Skeleton className="h-44 w-full mb-4" />
        <SkeletonCards n={3} />
      </div>
    );
  }
  const d = data.data;
  const sc = d.statusCounts || {};
  const total = Object.values(sc).reduce((a: any, b: any) => a + b, 0) as number;
  const failed = (sc.failed || 0) + (sc.refunded || 0);
  const pending = (sc.processing || 0) + (sc.created || 0) + (sc.pending || 0);

  const quick: { icon: React.ReactNode; label: string; sub: string; to: string }[] = [
    { icon: <Fingerprint size={20} />, label: 'Verify NIN', sub: 'Identity check', to: '/app/services' },
    { icon: <Plus size={20} />, label: 'Fund wallet', sub: 'Top up', to: '/app/wallet' },
    { icon: <History size={20} />, label: 'Transactions', sub: 'History & receipts', to: '/app/transactions' },
    { icon: <KeyRound size={20} />, label: 'API dashboard', sub: 'Keys & usage', to: '/app/api' },
    { icon: <Layers size={20} />, label: 'Bulk jobs', sub: 'CSV verification', to: '/app/bulk' },
    { icon: <LifeBuoy size={20} />, label: 'Support', sub: 'Get help', to: '/app/support' },
  ];

  return (
    <div className="page-in">
      <PageHeader
        title={`Welcome back, ${user?.firstName || user?.username || ''}`}
        subtitle="Manage verifications, wallet and API access from one place."
        actions={<Button size="sm" variant="ghost" icon={<History size={15} />} onClick={() => nav('/app/transactions')}>History</Button>}
      />
      <div className="grid lg:grid-cols-[1fr_380px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <WalletCard
            balance={kobo(d.wallet.balanceKobo)}
            sub={`Today's spending ${kobo(d.todaySpendKobo)}`}
            onFund={() => nav('/app/wallet')}
            onView={() => nav('/app/wallet')}
          />
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <Stat icon={<History size={20} />} label="Total transactions" value={String(total)} />
            <Stat icon={<CircleCheck size={20} />} label="Successful" value={String(sc.successful || 0)} />
            <Stat icon={<Clock size={20} />} label="Pending" value={String(pending)} />
            <Stat icon={<XCircle size={20} />} label="Failed" value={String(failed)} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="font-bold text-[0.95rem]">Quick actions</h2>
              <Link to="/app/services" className="text-xs font-bold text-brand-700 hover:underline inline-flex items-center gap-0.5">All services<ArrowRight size={13} /></Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {quick.map((q) => (
                <Link key={q.label} to={q.to} className="card card-hover p-4 flex items-center gap-3">
                  <span className="grid place-items-center w-10 h-10 rounded-xl bg-brand-50 text-brand-700 border border-brand-100 shrink-0" aria-hidden="true">{q.icon}</span>
                  <span className="min-w-0">
                    <span className="block font-bold text-sm truncate">{q.label}</span>
                    <span className="block text-xs text-ink-500 truncate">{q.sub}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-4 min-w-0">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-[0.95rem]">Recent transactions</h2>
              <Link to="/app/transactions" className="text-xs font-bold text-brand-700 hover:underline inline-flex items-center gap-0.5">View all<ChevronRight size={14} /></Link>
            </div>
            {d.recent.length === 0 ? (
              <EmptyState
                icon={<History size={24} />}
                title="No transactions yet"
                body="Run your first verification to see receipts here."
                action={<Link to="/app/services" className="btn-soft btn-sm">Run your first check</Link>}
              />
            ) : (
              <div className="space-y-1">
                {d.recent.map((t: any) => (
                  <Link key={t.txId} to={`/app/transactions/${t.txId}`} className="flex items-center justify-between gap-2 py-2 border-b border-mist-100 last:border-0 text-sm hover:bg-mist-50 rounded-lg px-1 -mx-1 transition-colors">
                    <span className="min-w-0">
                      <span className="block font-semibold truncate">{t.serviceSlug}</span>
                      <span className="block text-xs text-ink-500">{new Date(t.createdAt).toLocaleDateString()}</span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block font-bold tnum">{kobo(t.amountKobo)}</span>
                      <Badge status={t.status} />
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-[0.95rem]">Notifications</h2>
              <Link to="/app/notifications" className="text-xs font-bold text-brand-700 hover:underline inline-flex items-center gap-0.5">Inbox<ChevronRight size={14} /></Link>
            </div>
            {notifs.length === 0 ? (
              <p className="text-sm text-ink-500">You're all caught up.</p>
            ) : (
              notifs.map((n: any) => (
                <div key={n._id} className="py-2 border-b border-mist-100 last:border-0 text-sm">
                  <b>{n.title}</b>
                  <p className="text-ink-500">{n.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= Services ================= */
const CATS = [
  { value: '', label: 'All services' },
  { value: 'identity', label: 'Identity' },
  { value: 'business', label: 'Business' },
  { value: 'education', label: 'Education' },
  { value: 'other', label: 'Other' },
];

export function Services() {
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<any[]>([]);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState(params.get('q') || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  async function load(category: string, query: string) {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams();
      if (category) p.set('category', category);
      if (query) p.set('q', query);
      const r = await api(`/api/services?${p.toString()}`);
      setItems(r.data);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(cat, params.get('q') || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat]);

  function search(e: React.FormEvent) {
    e.preventDefault();
    setParams(q ? { q } : {});
    load(cat, q);
  }

  return (
    <div className="page-in">
      <PageHeader title="Verification services" subtitle="Live pricing from the backend — what you see is what you pay." />
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
        <div className="flex-1 min-w-0"><Tabs options={CATS} value={cat} onChange={setCat} /></div>
        <form onSubmit={search} className="relative md:w-64" role="search">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" aria-hidden="true" />
          <input className="input !rounded-full !pl-10" placeholder="Search services…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search services" />
        </form>
      </div>
      {error ? (
        <ErrorState message={String(error.body?.message || error.message)} onRetry={() => load(cat, q)} />
      ) : loading ? (
        <SkeletonCards n={6} />
      ) : items.length === 0 ? (
        <EmptyState
          title="No services found"
          body="Try a different search term or category."
          action={<Button variant="ghost" onClick={() => { setQ(''); setCat(''); setParams({}); load('', ''); }}>Clear filters</Button>}
        />
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((s) => (
            <ServiceCard
              key={s.slug}
              to={`/app/services/${s.slug}`}
              name={s.name}
              description={s.description}
              category={s.category}
              price={kobo(s.priceKobo)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= Service detail ================= */
const FIELD_HINTS: Record<string, string> = {
  nin: 'Enter the 11-digit NIN of the person you want to verify.',
  bvn: 'Enter the 11-digit BVN of the account holder.',
  phone: 'Enter the registered phone number, e.g. 0803…',
  rcNumber: 'Enter the CAC RC number, e.g. RC123456.',
  tin: 'Enter the Tax Identification Number.',
  regNumber: 'Enter the JAMB registration number.',
};

export function ServiceDetail() {
  const { slug } = useParams();
  const nav = useNavigate();
  const [svc, setSvc] = useState<any>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/api/services/${slug}`).then((r) => setSvc(r.data)).catch(setError);
  }, [slug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api(`/api/verify/${slug}`, {
        method: 'POST',
        headers: { 'Idempotency-Key': `web-${Date.now()}-${Math.random().toString(36).slice(2)}` },
        body: JSON.stringify(form),
      });
      if (r.data?.status === 'successful') toast('Verification successful');
      else toast(`Request ${r.data?.status}`, 'info');
      nav(`/app/transactions/${r.data.txId}`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  if (error && !svc) return <div className="page-in"><ErrorState message={String(error.body?.message || error.message)} onRetry={() => location.reload()} /></div>;
  if (!svc) {
    return (
      <div className="page-in space-y-3">
        <Skeleton className="h-8 w-64" />
        <div className="grid lg:grid-cols-[1fr_380px] gap-4">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  return (
    <div className="page-in mx-auto max-w-4xl">
      <Link to="/app/services" className="text-sm text-brand-700 font-semibold hover:underline inline-flex items-center gap-1 transition-colors"><ChevronLeft size={15} /> All services</Link>
      <div className="flex items-start gap-4 mt-2 mb-5">
        <ServiceIcon category={svc.category} />
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{svc.name}</h1>
          <p className="text-sm text-ink-500 mt-0.5">{svc.description}</p>
        </div>
      </div>
      <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
        <form onSubmit={submit} className="card p-5 sm:p-6" aria-label={`${svc.name} form`}>
          <h2 className="font-bold mb-4">Enter details</h2>
          <InlineError error={error} />
          {svc.fields.map((f: any) => (
            <Field key={f.name} label={f.label} htmlFor={`f-${f.name}`} hint={FIELD_HINTS[f.name] || (f.required ? 'This field is required.' : undefined)}>
              <input
                id={`f-${f.name}`}
                className="input font-mono"
                value={form[f.name] || ''}
                onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                required={f.required}
                minLength={f.minLength}
                maxLength={f.maxLength}
                placeholder={f.minLength === 11 ? 'e.g. 12345678901' : `Enter ${f.label.toLowerCase()}`}
                autoComplete="off"
                inputMode={f.type === 'number' || f.minLength === 11 ? 'numeric' : undefined}
              />
            </Field>
          ))}
          {svc.terms && <p className="text-xs text-ink-500 mb-4 rounded-xl bg-mist-50 border border-mist-200 p-3">{svc.terms}</p>}
          <Button className="w-full" loading={busy}><ShieldCheck size={16} /> Pay {kobo(svc.priceKobo)} &amp; verify</Button>
          <p className="hint text-center mt-2.5">Duplicate taps are safe — idempotency prevents double charges.</p>
        </form>
        <aside className="card p-5 space-y-3 text-sm" aria-label="Service summary">
          <div className="flex justify-between"><span className="text-ink-500">Price</span><b className="tnum text-base">{kobo(svc.priceKobo)}</b></div>
          <div className="flex justify-between"><span className="text-ink-500">Processing</span><b className="inline-flex items-center gap-1.5"><Sparkles size={13} className="text-brand-600" />Instant</b></div>
          <div className="flex justify-between items-center"><span className="text-ink-500">Status</span><Badge status={svc.status} /></div>
          <div className="flex justify-between items-center"><span className="text-ink-500">Category</span><Badge status="active">{svc.category}</Badge></div>
          <div className="border-t border-mist-100 pt-3">
            <p className="font-bold text-[0.83rem] mb-1.5">Requirements</p>
            <ul className="space-y-1 text-ink-700">
              {svc.fields.map((f: any) => (
                <li key={f.name} className="flex items-center gap-1.5"><ShieldCheck size={14} className="text-brand-600" aria-hidden="true" />{f.label}{f.required ? '' : ' (optional)'}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl bg-brand-50 border border-brand-100 p-3 text-xs text-brand-800">
            Technical failures are auto-refunded. Only masked data is stored.
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ================= Wallet ================= */
const LEDGER_TABS = [
  { value: '', label: 'All activity' },
  { value: 'funding', label: 'Funding' },
  { value: 'debit', label: 'Spending' },
  { value: 'refund', label: 'Refunds' },
  { value: 'commission', label: 'Commissions' },
];

export function WalletPage() {
  const [wallet, setWallet] = useState<any>(null);
  const [ledger, setLedger] = useState<any[]>([]);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [amount, setAmount] = useState('1000');
  const [error, setError] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load(p = 1, t = type) {
    setLoading(true);
    try {
      const w = await api('/api/wallet');
      setWallet(w.data);
      const l = await api(`/api/wallet/ledger?limit=15&page=${p}${t ? `&type=${t}` : ''}`);
      setLedger(l.data);
      setPages(l.pagination.pages);
      setPage(l.pagination.page);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load(1, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeType(t: string) {
    setType(t);
    load(1, t);
  }

  async function fund() {
    setBusy(true);
    setError(null);
    try {
      const koboAmt = Math.round(Number(amount) * 100);
      const init = await api('/api/wallet/fund/initiate', { method: 'POST', body: JSON.stringify({ amountKobo: koboAmt }) });
      await api('/api/wallet/fund/verify', { method: 'POST', body: JSON.stringify({ reference: init.data.reference }) });
      toast(`Wallet funded with ${kobo(koboAmt)}`);
      await load(1, type);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-in">
      <PageHeader title="Wallet" subtitle="Ledger-based balance — every kobo traceable." />
      <InlineError error={error} />
      <div className="grid lg:grid-cols-[380px_1fr] gap-4 items-start">
        <div className="space-y-4">
          {loading && !wallet ? <Skeleton className="h-48" /> : (
            <WalletCard balance={wallet ? kobo(wallet.balanceKobo) : kobo(0)} sub="Available to spend on verifications" />
          )}
          <div className="card p-5">
            <h2 className="font-bold flex items-center gap-2"><Landmark size={18} className="text-brand-700" /> Fund wallet</h2>
            <p className="text-xs text-ink-500 mt-1 mb-3">Sandbox gateway — confirmed instantly. Minimum ₦100.</p>
            <Field label="Amount (₦)" htmlFor="amt">
              <input id="amt" className="input tnum" type="number" min="100" step="50" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {[500, 1000, 5000, 10000].map((v) => (
                <button key={v} type="button" onClick={() => setAmount(String(v))} className={`rounded-full px-3 py-1.5 text-xs font-bold border min-h-[32px] transition-colors ${amount === String(v) ? 'bg-brand-900 text-white border-brand-900' : 'border-mist-200 hover:border-brand-300'}`}>
                  ₦{v.toLocaleString()}
                </button>
              ))}
            </div>
            <Button className="w-full" loading={busy} icon={<ArrowDownLeft size={16} />} onClick={fund}>Fund wallet</Button>
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-3"><Tabs options={LEDGER_TABS} value={type} onChange={changeType} /></div>
          {loading ? <SkeletonTable /> : ledger.length === 0 ? (
            <EmptyState icon={<WalletIcon size={26} />} title="No activity yet" body="Fund your wallet to see every credit, debit and refund here." />
          ) : (
            <>
              <div className="table-wrap hidden md:block">
                <table className="data">
                  <thead><tr><th>Date</th><th>Narration</th><th>Type</th><th className="text-right">Amount</th><th className="text-right">Balance</th></tr></thead>
                  <tbody>
                    {ledger.map((l: any) => (
                      <tr key={l._id}>
                        <td className="text-ink-500 text-[0.83rem] whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                        <td className="font-medium">{l.narration}</td>
                        <td><Badge status={l.type === 'credit' || l.type === 'funding' || l.type === 'manual_credit' ? 'successful' : l.type === 'refund' ? 'refunded' : l.type === 'commission' ? 'completed' : 'pending'}>{l.type.replace(/_/g, ' ')}</Badge></td>
                        <td className="text-right font-bold tnum" style={{ color: l.amountKobo < 0 ? '#b42318' : '#0f7a40' }}>
                          {l.amountKobo < 0 ? '−' : '+'}{kobo(Math.abs(l.amountKobo))}
                        </td>
                        <td className="text-right tnum text-ink-500">{kobo(l.balanceAfterKobo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden space-y-2.5">
                {ledger.map((l: any) => (
                  <div key={l._id} className="card p-4 flex items-center gap-3">
                    <span className="grid place-items-center w-10 h-10 rounded-xl shrink-0" style={{ background: l.amountKobo < 0 ? '#fdeceb' : '#e7f6ec', color: l.amountKobo < 0 ? '#b42318' : '#166534' }} aria-hidden="true">
                      {l.amountKobo < 0 ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-sm truncate">{l.narration}</span>
                      <span className="block text-xs text-ink-500">{new Date(l.createdAt).toLocaleString()}</span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block font-extrabold tnum" style={{ color: l.amountKobo < 0 ? '#b42318' : '#166534' }}>{l.amountKobo < 0 ? '−' : '+'}{kobo(Math.abs(l.amountKobo))}</span>
                      <span className="block text-xs text-ink-500 tnum">{kobo(l.balanceAfterKobo)}</span>
                    </span>
                  </div>
                ))}
              </div>
              <Pagination page={page} pages={pages} onChange={(p) => load(p, type)} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= Transactions ================= */
const TX_TABS = [
  { value: '', label: 'All' },
  { value: 'successful', label: 'Successful' },
  { value: 'processing', label: 'Processing' },
  { value: 'failed', label: 'Failed' },
  { value: 'refunded', label: 'Refunded' },
];

export function Transactions() {
  const [items, setItems] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  async function load(s = status, p = 1) {
    setLoading(true);
    setError(null);
    try {
      const r = await api(`/api/transactions?limit=15&page=${p}${s ? `&status=${s}` : ''}`);
      setItems(r.data);
      setPages(r.pagination.pages);
      setPage(r.pagination.page);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load('', 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function change(s: string) {
    setStatus(s);
    load(s, 1);
  }

  return (
    <div className="page-in">
      <PageHeader title="Transactions" subtitle="Every check, receipt and refund in one place." />
      <div className="mb-4"><Tabs options={TX_TABS} value={status} onChange={change} /></div>
      {error ? (
        <ErrorState message={String(error.body?.message || error.message)} onRetry={() => load(status, page)} />
      ) : loading ? (
        <SkeletonTable />
      ) : items.length === 0 ? (
        <EmptyState
          title="No transactions yet"
          body="Run your first verification and it will appear here with a downloadable receipt."
          action={<Link to="/app/services" className="btn-primary btn-sm">Explore services</Link>}
        />
      ) : (
        <>
          <TxList items={items} linkPrefix="/app/transactions" />
          <Pagination page={page} pages={pages} onChange={(p) => load(status, p)} />
        </>
      )}
    </div>
  );
}

/* ================= Receipt ================= */
export function Receipt() {
  const { txId } = useParams();
  const [tx, setTx] = useState<any>(null);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    api(`/api/transactions/${txId}`).then((r) => setTx(r.data)).catch(setError);
  }, [txId]);

  if (error) return <div className="page-in"><ErrorState message={String(error.body?.message || error.message)} onRetry={() => location.reload()} /></div>;
  if (!tx) {
    return (
      <div className="page-in mx-auto max-w-xl space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const rows: [string, React.ReactNode][] = [
    ['Transaction ID', <span key="a" className="font-mono text-[0.83rem]">{tx.txId}</span>],
    ['Service', tx.serviceSlug],
    ['Amount', <b key="b" className="tnum">{kobo(tx.amountKobo)}</b>],
    ['Date', new Date(tx.createdAt).toLocaleString()],
  ];
  if (tx.providerRef) rows.push(['Provider ref', <span key="c" className="font-mono text-[0.83rem]">{tx.providerRef}</span>]);

  return (
    <div className="page-in mx-auto max-w-xl">
      <PageHeader title="Transaction receipt" subtitle="Printable record of your verification." />
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 text-white" style={{ background: 'linear-gradient(135deg, #0a3f2a, #031810)' }}>
          <span className="font-extrabold">Naija<span className="text-brand-300">Verify</span></span>
          <Badge status={tx.status} />
        </div>
        <dl className="px-5 sm:px-6 py-4 text-sm space-y-2.5">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-ink-500 shrink-0">{k}</dt>
              <dd className="text-right break-all">{v}</dd>
            </div>
          ))}
          {tx.errorMessage && (
            <div className="rounded-xl bg-mist-50 border border-mist-200 p-3 text-ink-700">{tx.errorMessage}</div>
          )}
        </dl>
        {tx.result && (
          <div className="mx-5 sm:mx-6 mb-4 rounded-xl bg-brand-50 border border-brand-100 p-4">
            <p className="font-bold text-sm text-brand-800 flex items-center gap-1.5"><ShieldCheck size={15} /> Verified result (masked)</p>
            <div className="mt-2 flex gap-2">
              <CopyButton text={JSON.stringify(tx.result, null, 2)} label="Copy result" />
            </div>
            <pre className="mt-2 whitespace-pre-wrap text-xs text-brand-900 font-mono max-h-56 overflow-auto">{JSON.stringify(tx.result, null, 2)}</pre>
          </div>
        )}
        <div className="flex flex-wrap gap-2 px-5 sm:px-6 pb-5">
          <Button variant="ghost" size="sm" icon={<Printer size={15} />} onClick={() => window.print()}>Print</Button>
          <Link to="/app/support" className="btn-ghost btn-sm">Contact support</Link>
        </div>
      </div>
    </div>
  );
}