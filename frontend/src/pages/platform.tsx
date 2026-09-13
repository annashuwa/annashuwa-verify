import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  KeyRound, Plus, RefreshCw, Ban, Webhook, FileText, Gift, Copy, Check,
  Bell, LifeBuoy, UserRound, Lock, Smartphone, MonitorSmartphone, Upload,
  Send, Activity, BookOpen, Zap, ShieldCheck,
} from 'lucide-react';
import { api, kobo, getAccess } from '../lib/api';
import { useUser } from '../components/ui';
import { Logo } from '../components/kit';
import {
  PageHeader, Stat, Badge, Button, Field, EmptyState, ErrorState, InlineError,
  SkeletonCards, SkeletonTable, Skeleton, CopyButton, Tabs, Pagination,
  toast, confirmDialog,
} from '../components/kit';

/* ================= API dashboard ================= */
export function ApiDashboard() {
  const [keys, setKeys] = useState<any[]>([]);
  const [usage, setUsage] = useState<any>(null);
  const [name, setName] = useState('Production key');
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hook, setHook] = useState({ keyId: '', url: '', hookSecret: '' });

  async function load() {
    try {
      const k = await api('/api/api-keys');
      setKeys(k.data);
      const u = await api('/api/api-usage');
      setUsage(u.data);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function create() {
    setError(null);
    try {
      const r = await api('/api/api-keys', { method: 'POST', body: JSON.stringify({ name }) });
      setSecret(r.data.apiKey);
      toast('API key created — copy the secret now');
      await load();
    } catch (e) {
      setError(e);
    }
  }
  async function revoke(id: string, n: string) {
    if (!(await confirmDialog({ title: `Revoke "${n}"?`, body: 'This key stops working immediately. This cannot be undone.', confirmLabel: 'Revoke key', danger: true }))) return;
    await api(`/api/api-keys/${id}/revoke`, { method: 'POST', body: JSON.stringify({}) });
    toast('API key revoked', 'info');
    await load();
  }
  async function rotate(id: string, n: string) {
    if (!(await confirmDialog({ title: `Rotate "${n}"?`, body: 'The old key stops working immediately and a new secret is issued.', confirmLabel: 'Rotate key' }))) return;
    const r = await api(`/api/api-keys/${id}/rotate`, { method: 'POST', body: JSON.stringify({}) });
    setSecret(r.data.apiKey);
    toast('Key rotated — copy the new secret now');
    await load();
  }

  if (loading) {
    return (
      <div className="page-in">
        <Skeleton className="h-8 w-56 mb-5" />
        <SkeletonCards n={3} />
      </div>
    );
  }

  return (
    <div className="page-in">
      <PageHeader
        title="API dashboard"
        subtitle="Keys, usage, webhooks and logs for your integration."
        actions={<Link to="/docs" className="btn-ghost btn-sm"><BookOpen size={15} /> Documentation</Link>}
      />
      <InlineError error={error} />
      {secret && (
        <div className="rounded-2xl bg-amber-50 border border-amber-300 p-4 sm:p-5 mb-4 text-sm" role="alert">
          <b>Copy your secret now — it will never be shown again.</b>
          <div className="flex flex-col sm:flex-row gap-2 mt-2">
            <code className="flex-1 break-all bg-white p-2.5 rounded-xl border font-mono text-xs">{secret}</code>
            <CopyButton text={secret} />
          </div>
        </div>
      )}
      {usage && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Stat icon={<Activity size={20} />} label="Requests today" value={String(usage.today)} />
          <Stat icon={<Check size={20} />} label="Successful" value={String(usage.success)} />
          <Stat icon={<Zap size={20} />} label="Failed" value={String(usage.failed)} />
          <Stat icon={<KeyRound size={20} />} label="Active keys" value={String(keys.filter((k: any) => k.status === 'active').length)} />
        </div>
      )}
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <div className="card p-5">
          <h2 className="font-bold flex items-center gap-2"><Plus size={17} className="text-brand-700" /> Create API key</h2>
          <div className="flex gap-2 mt-3">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Key name" placeholder="e.g. Production server" />
            <Button onClick={create}>Create</Button>
          </div>
          <div className="mt-4 space-y-2.5">
            {keys.length === 0 && <p className="text-sm text-ink-500">No keys yet — create one to start integrating.</p>}
            {keys.map((k: any) => (
              <div key={k._id} className="rounded-xl border border-mist-200 p-3.5 flex flex-wrap items-center gap-2.5 hover:border-brand-200 transition-colors">
                <span className="grid place-items-center w-9 h-9 rounded-lg bg-brand-900 text-gold-300 shrink-0" aria-hidden="true"><KeyRound size={17} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-sm truncate">{k.name}</span>
                  <span className="block font-mono text-xs text-ink-500 truncate">{k.prefix}</span>
                </span>
                <Badge status={k.status} />
                <span className="flex gap-1.5">
                  <Button variant="ghost" size="sm" icon={<RefreshCw size={13} />} onClick={() => rotate(k._id, k.name)}>Rotate</Button>
                  {k.status === 'active' && <Button variant="ghost" size="sm" icon={<Ban size={13} />} onClick={() => revoke(k._id, k.name)}>Revoke</Button>}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <h2 className="font-bold flex items-center gap-2"><Webhook size={17} className="text-brand-700" /> Transaction webhooks</h2>
          <p className="text-xs text-ink-500 mt-1 mb-3">Signed JSON (<code className="font-mono">transaction.successful|failed|refunded</code>) with <code className="font-mono">x-nv-signature</code> HMAC-SHA256.</p>
          <Field label="Key" htmlFor="hk">
            <select id="hk" className="input" value={hook.keyId} onChange={(e) => setHook({ ...hook, keyId: e.target.value })}>
              <option value="">Select key…</option>
              {keys.map((k: any) => <option key={k._id} value={k._id}>{k.name} ({k.prefix})</option>)}
            </select>
          </Field>
          <Field label="Endpoint URL" htmlFor="hu"><input id="hu" className="input font-mono text-sm" placeholder="https://your-app.com/hooks/naijaverify" value={hook.url} onChange={(e) => setHook({ ...hook, url: e.target.value })} /></Field>
          <Field label="Signing secret" htmlFor="hs"><input id="hs" className="input font-mono text-sm" placeholder="whsec_…" value={hook.hookSecret} onChange={(e) => setHook({ ...hook, hookSecret: e.target.value })} /></Field>
          <Button
            variant="ghost"
            disabled={!hook.keyId}
            onClick={async () => {
              setError(null);
              try {
                await api(`/api/api-keys/${hook.keyId}`, { method: 'PATCH', body: JSON.stringify({ webhookUrl: hook.url || null, webhookSecret: hook.hookSecret || null }) });
                setHook({ keyId: '', url: '', hookSecret: '' });
                toast('Webhook saved');
                await load();
              } catch (e) {
                setError(e);
              }
            }}
          >
            Save webhook
          </Button>
          {keys.filter((k: any) => k.webhookUrl).map((k: any) => (
            <p key={k._id} className="text-xs text-ink-500 mt-2 font-mono break-all">{k.prefix} → {k.webhookUrl}</p>
          ))}
        </div>
      </div>
      {usage?.logs?.length > 0 && (
        <>
          <h2 className="font-bold mt-6 mb-2.5">Recent API requests</h2>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Request</th><th>Status</th><th>Latency</th><th>Time</th></tr></thead>
              <tbody>
                {usage.logs.map((l: any) => (
                  <tr key={l._id}>
                    <td className="font-mono text-xs">{l.method} {l.path}</td>
                    <td><Badge status={l.status < 300 ? 'successful' : l.status < 500 ? 'pending' : 'failed'}>{String(l.status)}</Badge></td>
                    <td className="tnum">{l.latencyMs}ms</td>
                    <td className="text-ink-500 text-[0.83rem]">{new Date(l.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ================= API docs ================= */
const DOC_SECTIONS = [
  { id: 'auth', label: 'Authentication' },
  { id: 'verify', label: 'Verify identity' },
  { id: 'js', label: 'JavaScript' },
  { id: 'errors', label: 'Error codes' },
  { id: 'limits', label: 'Limits & webhooks' },
];

function Code({ code, id }: { code: string; id: string }) {
  return (
    <div className="relative">
      <pre className="codeblock p-4 pr-20 overflow-x-auto whitespace-pre">{code}</pre>
      <span className="absolute top-2.5 right-2.5"><CopyButton text={code} label="Copy" /></span>
      <span className="sr-only" id={id}>code sample</span>
    </div>
  );
}

export function ApiDocs() {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return (
    <ShellDocs>
      <div className="mx-auto max-w-6xl px-4 py-8 grid lg:grid-cols-[240px_1fr] gap-6 items-start">
        <aside className="hidden lg:block card p-3 sticky top-24" aria-label="Docs sections">
          {DOC_SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="block px-3 py-2.5 rounded-lg text-sm font-medium text-ink-700 hover:bg-mist-50 hover:text-brand-700 transition-colors">{s.label}</a>
          ))}
          <Link to="/app/api" className="btn-primary btn-sm w-full mt-2">Open API dashboard</Link>
        </aside>
        <article className="card p-6 sm:p-8 min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-600">Developers</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1">API documentation</h1>
          <p className="text-sm text-ink-500 mt-2">Base URL <code className="font-mono bg-mist-50 border border-mist-200 rounded px-1.5 py-0.5">{base}/api/v1</code> · Auth <code className="font-mono bg-mist-50 border border-mist-200 rounded px-1.5 py-0.5">Bearer PREFIX.SECRET</code></p>

          <h2 id="auth" className="font-extrabold text-lg mt-8 mb-2 scroll-mt-24">Authentication</h2>
          <p className="text-sm text-ink-500 mb-2">Create a key in the API dashboard (secret shown once). Send it as a Bearer token. Invalid, revoked or expired keys return <code className="font-mono">INVALID_API_KEY</code>.</p>
          <Code id="c-auth" code={`curl ${base}/api/v1/services \\\n  -H "Authorization: Bearer PREFIX.SECRET"`} />

          <h2 id="verify" className="font-extrabold text-lg mt-8 mb-2 scroll-mt-24">Verify an identity</h2>
          <p className="text-sm text-ink-500 mb-2">Always send an <code className="font-mono">Idempotency-Key</code> — retries with the same key never double-charge the wallet.</p>
          <Code id="c-verify" code={`curl -X POST ${base}/api/v1/verify/nin-verification \\\n  -H "Authorization: Bearer PREFIX.SECRET" \\\n  -H "Content-Type: application/json" \\\n  -H "Idempotency-Key: unique-key-123" \\\n  -d '{"nin": "12345678901"}'`} />

          <h2 id="js" className="font-extrabold text-lg mt-8 mb-2 scroll-mt-24">JavaScript example</h2>
          <Code id="c-js" code={`const res = await fetch("${base}/api/v1/verify/bvn-verification", {\n  method: "POST",\n  headers: {\n    "Authorization": "Bearer PREFIX.SECRET",\n    "Content-Type": "application/json",\n    "Idempotency-Key": crypto.randomUUID(),\n  },\n  body: JSON.stringify({ bvn: "12345678901" }),\n});\nconst data = await res.json();`} />

          <h2 id="errors" className="font-extrabold text-lg mt-8 mb-2 scroll-mt-24">Error codes</h2>
          <div className="table-wrap !rounded-xl">
            <table className="data">
              <thead><tr><th>Code</th><th>Meaning</th></tr></thead>
              <tbody>
                {[
                  ['INVALID_API_KEY', 'Key missing, revoked or wrong (401).'],
                  ['INSUFFICIENT_BALANCE', 'Fund the wallet first (402).'],
                  ['VALIDATION_ERROR', 'Required fields missing or invalid (400).'],
                  ['SERVICE_UNAVAILABLE', 'Service disabled or in maintenance (409).'],
                  ['PROVIDER_TIMEOUT', 'Technical failure — auto-refunded, safe to retry with a new key (200/201 with failed status).'],
                  ['RATE_LIMITED', 'Slow down (429).'],
                ].map(([c, m]) => (
                  <tr key={c}><td><code className="font-mono text-[0.8rem] font-semibold">{c}</code></td><td className="text-ink-700">{m}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 id="limits" className="font-extrabold text-lg mt-8 mb-2 scroll-mt-24">Rate limits &amp; webhooks</h2>
          <p className="text-sm text-ink-700">Each key has a per-minute limit (default 60, configurable). Configure a webhook URL per key to receive signed <code className="font-mono">transaction.successful|failed|refunded</code> events — verify <code className="font-mono">x-nv-signature</code> (HMAC-SHA256 of <code className="font-mono">timestamp.body</code>) before trusting the payload.</p>
          <div className="mt-5 lg:hidden"><Link to="/app/api" className="btn-primary w-full">Open API dashboard</Link></div>
        </article>
      </div>
    </ShellDocs>
  );
}

function ShellDocs({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-mist-50">
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-xl border-b border-mist-200">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <Link to="/"><Logo /></Link>
          <div className="flex gap-2">
            <Link to="/app/api" className="btn-ghost btn-sm">Dashboard</Link>
            <Link to="/register" className="btn-primary btn-sm">Get API key</Link>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

/* ================= Bulk ================= */
export function Bulk() {
  const [services, setServices] = useState<any[]>([]);
  const [slug, setSlug] = useState('nin-verification');
  const [text, setText] = useState('12345678901\n22345678902');
  const [jobs, setJobs] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const s = await api('/api/services');
      setServices(s.data);
      if (s.data.length > 0) setSlug((prev) => (s.data.some((x: any) => x.slug === prev) ? prev : s.data[0].slug));
      const j = await api('/api/bulk');
      setJobs(j.data);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const svc = services.find((s) => s.slug === slug);
      const field = svc?.fields?.[0]?.name || 'nin';
      const rows = text.split(/[\n,]+/).map((v) => v.trim()).filter(Boolean).slice(0, 500)
        .map((v) => ({ [field]: v }));
      if (rows.length === 0) throw new Error('Enter at least one value (one per line).');
      const r = await api('/api/bulk', { method: 'POST', body: JSON.stringify({ serviceSlug: slug, rows }) });
      setText('');
      toast(`Bulk job queued — ${rows.length} rows`);
      await load();
      const d = await api(`/api/bulk/${r.data.jobId}`);
      setDetail(d.data);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function open(jobId: string) {
    const d = await api(`/api/bulk/${jobId}`);
    setDetail(d.data);
  }

  async function downloadCsv() {
    if (!detail) return;
    const res = await fetch(`/api/bulk/${detail.jobId}/export`, { headers: { Authorization: `Bearer ${getAccess()}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${detail.jobId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const rowCount = text.split(/[\n,]+/).map((v) => v.trim()).filter(Boolean).length;

  return (
    <div className="page-in">
      <PageHeader title="Bulk verification" subtitle="Up to 500 rows per job. Jobs run in the background." />
      <InlineError error={error} />
      {loading ? <Skeleton className="h-64" /> : (
        <form onSubmit={submit} className="card p-5 sm:p-6 mb-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Service" htmlFor="bs">
              <select id="bs" className="input" value={slug} onChange={(e) => setSlug(e.target.value)}>
                {services.map((s: any) => <option key={s.slug} value={s.slug}>{s.name} — {kobo(s.priceKobo)} each</option>)}
              </select>
            </Field>
            <Field label={`Values (${rowCount} rows)`} htmlFor="bv" hint="One value per line, or comma-separated. CSV/TXT upload supported.">
              <textarea id="bv" className="input font-mono text-sm" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={'12345678901\n22345678902'} />
              <label className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-brand-700 cursor-pointer hover:underline">
                <Upload size={15} /> Upload CSV file
                <input type="file" accept=".csv,.txt" className="sr-only" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const reader = new FileReader();
                  reader.onload = () => setText(String(reader.result || ''));
                  reader.readAsText(f);
                }} />
              </label>
            </Field>
          </div>
          <Button loading={busy} icon={<Send size={15} />}>Submit bulk job</Button>
        </form>
      )}
      {detail && (
        <div className="card p-5 mb-4 text-sm">
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <p><b className="font-mono">{detail.jobId}</b> · <Badge status={detail.status} /> · <b className="tnum">{detail.succeeded}/{detail.total}</b> succeeded</p>
            <Button variant="ghost" size="sm" onClick={downloadCsv}>Download CSV</Button>
          </div>
          <div className="mt-3 max-h-48 overflow-auto rounded-xl border border-mist-200 divide-y divide-mist-100">
            {detail.rows.slice(0, 50).map((r: any, i: number) => (
              <div key={i} className="px-3 py-1.5 font-mono text-xs flex justify-between gap-2">
                <span className="truncate">{JSON.stringify(r.input)}</span>
                <b className={r.status === 'successful' ? 'text-brand-700' : 'text-red-700'}>{r.status}</b>
              </div>
            ))}
          </div>
        </div>
      )}
      <h2 className="font-bold mb-2.5">Recent jobs</h2>
      {jobs.length === 0 ? (
        <EmptyState icon={<FileText size={26} />} title="No bulk jobs yet" body="Submit your first batch above — progress appears here." />
      ) : (
        <div className="space-y-2">
          {jobs.map((j: any) => (
            <button key={j.jobId} onClick={() => open(j.jobId)} className="card card-hover p-4 w-full text-left text-sm flex flex-wrap items-center gap-2 justify-between">
              <span className="font-mono font-bold">{j.jobId}</span>
              <span className="text-ink-500">{j.serviceSlug}</span>
              <Badge status={j.status} />
              <span className="tnum">{j.done}/{j.total} done · {j.succeeded} ok · {j.failed} failed</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= Referrals ================= */
export function Referrals() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api('/api/referrals').then((r) => setData(r.data)).catch(setError).finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="page-in"><Skeleton className="h-8 w-48 mb-5" /><SkeletonCards n={3} /></div>;
  if (error) return <div className="page-in"><ErrorState message={String(error.body?.message || error.message)} onRetry={() => location.reload()} /></div>;
  const link = `${window.location.origin}/register?ref=${data.referralCode}`;
  return (
    <div className="page-in">
      <PageHeader title="Referrals" subtitle={`Earn ${data.ratePercent}% of profit on every successful referral transaction.`} />
      <div className="card p-5 sm:p-6 mb-4 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: 'linear-gradient(90deg, #14724c, #d4b53f)' }} aria-hidden="true" />
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-ink-500">Your referral code</p>
        <div className="flex flex-wrap items-center gap-3 mt-1.5">
          <p className="text-3xl font-extrabold font-mono tracking-tight">{data.referralCode}</p>
          <CopyButton text={data.referralCode} />
        </div>
        <div className="flex flex-col sm:flex-row gap-2 mt-3">
          <code className="flex-1 break-all bg-mist-50 border border-mist-200 rounded-xl px-3 py-2.5 text-xs font-mono">{link}</code>
          <CopyButton text={link} label="Copy link" />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <Stat icon={<Gift size={20} />} label="Referred users" value={String(data.referredCount)} />
          <Stat icon={<Check size={20} />} label="Earned" value={kobo(data.earnedKobo)} />
        </div>
      </div>
      <h2 className="font-bold mb-2.5">Commission history</h2>
      {data.commissions.length === 0 ? (
        <EmptyState icon={<Gift size={26} />} title="No commissions yet" body="Share your link — earnings land here automatically." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Transaction</th><th className="text-right">Amount</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {data.commissions.map((c: any) => (
                <tr key={c._id}>
                  <td className="font-mono text-xs">{c.txId}</td>
                  <td className="text-right font-bold tnum">{kobo(c.amountKobo)}</td>
                  <td><Badge status={c.status} /></td>
                  <td className="text-ink-500 text-[0.83rem]">{new Date(c.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ================= Notifications ================= */
export function Notifications() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    const r = await api('/api/notifications');
    setItems(r.data);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);
  async function readAll() {
    await api('/api/notifications/read-all', { method: 'POST', body: JSON.stringify({}) });
    toast('All notifications marked as read', 'info');
    await load();
  }
  const iconFor = (t: string) => {
    if (/success|fund|welcome|commission|complete/i.test(t)) return <Check size={17} className="text-brand-700" />;
    if (/fail|refund|suspend|suspicious/i.test(t)) return <Bell size={17} className="text-amber-600" />;
    return <Bell size={17} className="text-ink-500" />;
  };
  return (
    <div className="page-in">
      <PageHeader title="Notifications" subtitle="Transactions, refunds, security and funding alerts." actions={<Button variant="ghost" size="sm" onClick={readAll}>Mark all read</Button>} />
      {loading ? <SkeletonTable rows={4} /> : items.length === 0 ? (
        <EmptyState icon={<Bell size={26} />} title="No notifications" body="You're all caught up." />
      ) : (
        <div className="space-y-2">
          {items.map((n: any) => (
            <div key={n._id} className="card p-4 flex gap-3 transition-colors" style={n.read ? {} : { borderColor: '#84bc95', background: '#fbfdfb' }}>
              <span className="grid place-items-center w-9 h-9 rounded-xl bg-mist-50 border border-mist-200 shrink-0" aria-hidden="true">{iconFor(n.type)}</span>
              <div className="min-w-0">
                <p className="font-bold text-sm">{n.title} {!n.read && <span className="ml-1 inline-block w-2 h-2 rounded-full bg-brand-500 align-middle" aria-label="unread" />}</p>
                <p className="text-sm text-ink-500">{n.body}</p>
                <p className="text-xs text-ink-500 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= Support ================= */
export function Support() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [form, setForm] = useState({ subject: '', message: '', priority: 'normal', txId: '' });
  const [error, setError] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  async function load() {
    try {
      const r = await api('/api/support');
      setTickets(r.data);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: any = { ...form };
      if (!payload.txId) delete payload.txId;
      await api('/api/support', { method: 'POST', body: JSON.stringify(payload) });
      setForm({ subject: '', message: '', priority: 'normal', txId: '' });
      toast('Ticket opened — we reply here');
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-in">
      <PageHeader title="Support" subtitle="Attach a transaction ID for faster resolution." />
      <InlineError error={error} />
      <div className="grid lg:grid-cols-[380px_1fr] gap-4 items-start">
        <form onSubmit={submit} className="card p-5">
          <h2 className="font-bold mb-3">Open a ticket</h2>
          <Field label="Subject" htmlFor="ss"><input id="ss" className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required /></Field>
          <Field label="Related transaction (optional)" htmlFor="st"><input id="st" className="input font-mono text-sm" placeholder="TX-…" value={form.txId} onChange={(e) => setForm({ ...form, txId: e.target.value })} /></Field>
          <Field label="Priority" htmlFor="sp">
            <select id="sp" className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
            </select>
          </Field>
          <Field label="Message" htmlFor="sm"><textarea id="sm" className="input" rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required /></Field>
          <Button className="w-full" loading={busy} icon={<Send size={15} />}>Submit ticket</Button>
        </form>
        <div className="min-w-0">
          {loading ? <SkeletonTable rows={3} /> : tickets.length === 0 ? (
            <EmptyState icon={<LifeBuoy size={26} />} title="No tickets" body="Questions about a check or refund? Open your first ticket." />
          ) : tickets.map((t: any) => (
            <div key={t.ticketNo} className="card p-4 mb-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <b className="font-mono">{t.ticketNo}</b>
                <Badge status={t.status} />
                <span className="text-ink-500">priority {t.priority}</span>
              </div>
              <p className="font-bold mt-1">{t.subject}</p>
              <div className="mt-2 space-y-1.5 border-l-2 border-mist-200 pl-3">
                {t.messages.map((m: any, i: number) => (
                  <p key={i} className="text-ink-700"><b className={m.from.startsWith('staff:') ? 'text-brand-700' : ''}>{m.from}:</b> {m.body}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================= Profile ================= */
export function Profile() {
  const [user, setUser] = useUser();
  const [form, setForm] = useState({ firstName: user?.firstName || '', lastName: user?.lastName || '', phone: user?.phone || '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [pin, setPin] = useState({ currentPin: '', newPin: '' });
  const [tfa, setTfa] = useState<any>(null);
  const [tfaCode, setTfaCode] = useState('');
  const [tfaPw, setTfaPw] = useState('');

  useEffect(() => {
    api('/api/auth/sessions').then((r) => setSessions(r.data)).catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/api/auth/me', { method: 'PATCH', body: JSON.stringify(form) });
      const me = await api('/api/auth/me');
      setUser(me.data);
      localStorage.setItem('nv_user', JSON.stringify(me.data));
      toast('Profile updated');
    } catch (e) {
      setError(e);
    }
  }
  async function changePw(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify(pw) });
      setPw({ currentPassword: '', newPassword: '' });
      toast('Password changed — please log in again', 'info');
    } catch (e) {
      setError(e);
    }
  }
  async function changePin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const payload: any = { newPin: pin.newPin };
      if (pin.currentPin) payload.currentPin = pin.currentPin;
      await api('/api/auth/change-pin', { method: 'POST', body: JSON.stringify(payload) });
      setPin({ currentPin: '', newPin: '' });
      toast('Transaction PIN updated');
    } catch (e) {
      setError(e);
    }
  }
  async function setup2fa() {
    setError(null);
    try {
      const r = await api('/api/auth/2fa/setup', { method: 'POST', body: JSON.stringify({}) });
      setTfa(r.data);
    } catch (e) {
      setError(e);
    }
  }
  async function enable2fa(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/api/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code: tfaCode }) });
      setTfa(null);
      setTfaCode('');
      toast('Two-factor authentication enabled');
    } catch (e) {
      setError(e);
    }
  }
  async function disable2fa(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/api/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ password: tfaPw }) });
      setTfaPw('');
      toast('Two-factor authentication disabled', 'info');
    } catch (e) {
      setError(e);
    }
  }

  return (
    <div className="page-in mx-auto max-w-2xl">
      <PageHeader title="Profile & security" subtitle="Identity, credentials and active sessions." />
      <InlineError error={error} />
      {msg && <p className="text-brand-700 text-sm mb-3">{msg}</p>}
      <div className="card p-5 sm:p-6 mb-4 flex items-center gap-4">
        <UserAvatar name={`${form.firstName} ${form.lastName}`.trim() || user?.email} />
        <div className="min-w-0">
          <p className="font-extrabold text-lg truncate">{form.firstName} {form.lastName}</p>
          <p className="text-sm text-ink-500 truncate">{user?.email}</p>
          <p className="mt-1"><Badge status="active">{String(user?.role || '').replace(/_/g, ' ')}</Badge> <span className="text-xs text-ink-500 font-mono ml-1">{user?.referralCode}</span></p>
        </div>
      </div>
      <form onSubmit={save} className="card p-5 sm:p-6 mb-4">
        <h2 className="font-bold mb-3">Personal details</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="First name" htmlFor="pf"><input id="pf" className="input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
          <Field label="Last name" htmlFor="pl"><input id="pl" className="input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
        </div>
        <Field label="Phone" htmlFor="pp"><input id="pp" className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        <Button>Save profile</Button>
      </form>
      <div className="grid sm:grid-cols-2 gap-4">
        <form onSubmit={changePw} className="card p-5">
          <h2 className="font-bold mb-3 flex items-center gap-2"><Lock size={16} className="text-brand-700" /> Password</h2>
          <Field label="Current" htmlFor="cpw"><input id="cpw" type="password" className="input" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
          <Field label="New (8+ chars)" htmlFor="npw"><input id="npw" type="password" className="input" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
          <Button variant="ghost">Change password</Button>
        </form>
        <form onSubmit={changePin} className="card p-5">
          <h2 className="font-bold mb-3 flex items-center gap-2"><Smartphone size={16} className="text-brand-700" /> Transaction PIN</h2>
          <Field label="Current (blank on first setup)" htmlFor="cpin"><input id="cpin" type="password" inputMode="numeric" className="input font-mono" value={pin.currentPin} onChange={(e) => setPin({ ...pin, currentPin: e.target.value })} /></Field>
          <Field label="New 4–6 digit PIN" htmlFor="npin"><input id="npin" type="password" inputMode="numeric" className="input font-mono" value={pin.newPin} onChange={(e) => setPin({ ...pin, newPin: e.target.value })} required /></Field>
          <Button variant="ghost">Save PIN</Button>
        </form>
      </div>
      <div className="card p-5 sm:p-6 mt-4">
        <h2 className="font-bold mb-1">Two-factor authentication</h2>
        <p className="text-xs text-ink-500 mb-3">Authenticator-app codes (TOTP) add a second step to password login.</p>
        {!tfa ? (
          <div className="flex flex-wrap gap-2 items-center">
            <Button variant="ghost" size="sm" onClick={setup2fa}>Set up 2FA</Button>
            <form onSubmit={disable2fa} className="flex gap-2">
              <input type="password" className="input !w-44 !min-h-[36px]" placeholder="Password to disable" value={tfaPw} onChange={(e) => setTfaPw(e.target.value)} aria-label="Password" />
              <Button variant="ghost" size="sm">Disable</Button>
            </form>
          </div>
        ) : (
          <form onSubmit={enable2fa}>
            <p className="text-sm text-ink-700 mb-2">Add this secret to your authenticator app, then enter the 6-digit code:</p>
            <code className="block bg-mist-50 border border-mist-200 p-2.5 rounded-xl text-sm break-all mb-1 font-mono">{tfa.secret}</code>
            <p className="text-xs text-ink-500 break-all mb-2 font-mono">{tfa.otpauthUrl}</p>
            <div className="flex gap-2">
              <input className="input !w-44 font-mono" inputMode="numeric" placeholder="123456" value={tfaCode} onChange={(e) => setTfaCode(e.target.value)} aria-label="Code" />
              <Button size="sm">Enable 2FA</Button>
            </div>
          </form>
        )}
      </div>
      <div className="card p-5 sm:p-6 mt-4">
        <h2 className="font-bold mb-3 flex items-center gap-2"><MonitorSmartphone size={16} className="text-brand-700" /> Active sessions</h2>
        {sessions.length === 0 ? <p className="text-sm text-ink-500">No other sessions.</p> : sessions.map((s: any) => (
          <div key={s.id} className="text-sm py-2 border-b border-mist-100 last:border-0 flex justify-between gap-2">
            <span className="truncate">{s.userAgent || 'Unknown device'} · {s.ip || ''}</span>
            <span className="text-ink-500 shrink-0">{new Date(s.createdAt).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function UserAvatar({ name }: { name: string }) {
  return (
    <span className="grid place-items-center w-14 h-14 rounded-2xl text-white font-extrabold text-xl shrink-0" style={{ background: 'linear-gradient(135deg, #14724c, #06291c)' }} aria-hidden="true">
      {String(name || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'}
    </span>
  );
}