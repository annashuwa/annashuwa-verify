import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight, Check, ShieldCheck, Zap, KeyRound, Menu, X, Fingerprint,
  Building2, Landmark, GraduationCap, FileText, Lock, Smartphone, ChevronDown,
} from 'lucide-react';
import { api, setTokens } from '../lib/api';
import { saveUser, Shell } from '../components/ui';
import { Logo, Button, Field, InlineError } from '../components/kit';

/* ================= Landing ================= */
const SERVICE_TILES = [
  { icon: <Fingerprint size={22} />, t: 'NIN Verification', d: 'Confirm National Identification Numbers with full demographic match.' },
  { icon: <Landmark size={22} />, t: 'BVN Verification', d: 'Validate Bank Verification Numbers for KYC and onboarding.' },
  { icon: <Building2 size={22} />, t: 'CAC Verification', d: 'Confirm business RC numbers and company records.' },
  { icon: <FileText size={22} />, t: 'TIN Verification', d: 'Validate Tax Identification Numbers for compliance.' },
  { icon: <GraduationCap size={22} />, t: 'JAMB Verification', d: 'Check JAMB registration records for screening.' },
  { icon: <KeyRound size={22} />, t: 'Developer APIs', d: 'REST APIs with keys, webhooks, logs and sandbox mocks.' },
];

const FAQS = [
  { q: 'What happens if a provider fails?', a: 'The engine automatically fails over to the next healthy provider. Technical failures that cannot be served are auto-refunded — you never pay for a check that never ran.' },
  { q: 'Is my wallet safe?', a: 'Every movement is a ledger entry in kobo (no float errors), debits are atomic, and duplicate requests are blocked by idempotency keys.' },
  { q: 'Do you store my NIN or BVN?', a: 'Only masked request data is retained for receipts and audits. Full identity numbers are never shown back in the interface.' },
  { q: 'Can I resell verifications or integrate via API?', a: 'Yes — reseller and API pricing tiers, referral commissions, API keys with webhooks, and full request logs are built in.' },
];

export function Landing() {
  const [menu, setMenu] = useState(false);
  return (
    <div className="min-h-screen bg-white">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-2 focus:bg-white focus:z-50">Skip to content</a>
      {/* Nav */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-xl border-b border-mist-200/70">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between gap-3">
          <Link to="/" aria-label="NaijaVerify home"><Logo /></Link>
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-ink-700" aria-label="Site">
            <a href="#services" className="hover:text-brand-700 transition-colors">Services</a>
            <a href="#how" className="hover:text-brand-700 transition-colors">How it works</a>
            <a href="#security" className="hover:text-brand-700 transition-colors">Security</a>
            <Link to="/docs" className="hover:text-brand-700 transition-colors">API docs</Link>
          </nav>
          <div className="hidden md:flex items-center gap-2">
            <Link to="/login" className="btn-ghost btn-sm">Log in</Link>
            <Link to="/register" className="btn-primary btn-sm">Get started<ArrowRight size={15} /></Link>
          </div>
          <button className="md:hidden p-2 rounded-lg hover:bg-mist-100" onClick={() => setMenu(!menu)} aria-label="Menu" aria-expanded={menu}>
            {menu ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menu && (
          <nav className="md:hidden border-t border-mist-200 px-4 py-3 flex flex-col gap-1 text-sm font-medium" aria-label="Mobile site">
            <a href="#services" onClick={() => setMenu(false)} className="px-2 py-2.5 rounded-lg hover:bg-mist-50">Services</a>
            <a href="#how" onClick={() => setMenu(false)} className="px-2 py-2.5 rounded-lg hover:bg-mist-50">How it works</a>
            <Link to="/docs" onClick={() => setMenu(false)} className="px-2 py-2.5 rounded-lg hover:bg-mist-50">API docs</Link>
            <div className="flex gap-2 pt-2">
              <Link to="/login" className="btn-ghost btn-sm flex-1">Log in</Link>
              <Link to="/register" className="btn-primary btn-sm flex-1">Get started</Link>
            </div>
          </nav>
        )}
      </header>

      <main id="main">
        {/* Hero */}
        <section className="relative overflow-hidden" style={{ background: 'linear-gradient(170deg, #031810 0%, #0a3f2a 55%, #06291c 100%)' }}>
          <div className="absolute inset-0 hero-grid" aria-hidden="true" />
          <div className="absolute inset-0" aria-hidden="true" style={{ background: 'radial-gradient(620px 320px at 82% 8%, rgba(31,138,93,0.35), transparent), radial-gradient(520px 280px at 12% 92%, rgba(212,181,63,0.12), transparent)' }} />
          <div className="relative mx-auto max-w-6xl px-4 py-16 sm:py-20 grid lg:grid-cols-[1.05fr_0.95fr] gap-10 items-center">
            <div className="page-in">
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 backdrop-blur text-brand-100 text-xs font-semibold px-3.5 py-1.5">
                <ShieldCheck size={14} className="text-gold-300" /> Identity verification for Nigeria
              </p>
              <h1 className="text-white font-extrabold tracking-tight text-[2.6rem] sm:text-6xl leading-[1.06] mt-5">
                Verify identities, businesses &amp; records — <span className="text-gold-300">in seconds.</span>
              </h1>
              <p className="text-white/70 text-base sm:text-lg mt-5 max-w-xl leading-relaxed">
                Fund a wallet, pick a service, and get trustworthy NIN, BVN, CAC, TIN and JAMB
                results through one secure platform — with developer APIs, provider failover
                and full audit trails.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/register" className="rounded-xl bg-white text-brand-900 font-bold text-sm px-5 py-3 min-h-[46px] inline-flex items-center gap-2 hover:bg-brand-50 transition-all hover:shadow-lg">
                  Create free account<ArrowRight size={16} />
                </Link>
                <Link to="/docs" className="rounded-xl border border-white/25 text-white font-semibold text-sm px-5 py-3 min-h-[46px] inline-flex items-center gap-2 hover:bg-white/10 transition-colors">
                  Explore the API
                </Link>
              </div>
              <dl className="mt-10 grid grid-cols-3 max-w-md gap-4">
                {[['7+', 'Services live'], ['<2s', 'Median check'], ['100%', 'Audited flows']].map(([v, l]) => (
                  <div key={l} className="rounded-xl border border-white/10 bg-white/5 backdrop-blur px-4 py-3">
                    <dt className="sr-only">{l}</dt>
                    <dd className="text-white font-extrabold text-xl tnum">{v}</dd>
                    <dd className="text-white/55 text-xs mt-0.5">{l}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="card p-6 sm:p-7 page-in" aria-label="How it works">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-extrabold text-lg">How it works</h2>
                <span className="rounded-full bg-brand-50 border border-brand-100 text-brand-700 text-[0.7rem] font-bold px-2.5 py-1 uppercase tracking-wide">4 steps</span>
              </div>
              <ol className="space-y-4">
                {[
                  ['Register', 'Create an account and verify your email.'],
                  ['Fund wallet', 'Top up instantly via the sandbox gateway.'],
                  ['Verify', 'Choose a service, submit details, get results.'],
                  ['Build', 'Use receipts, webhooks and APIs in your product.'],
                ].map(([t, d], i) => (
                  <li key={t} className="flex gap-3.5">
                    <span className="grid place-items-center w-9 h-9 rounded-xl bg-brand-900 text-gold-300 text-sm font-bold shrink-0" aria-hidden="true">{i + 1}</span>
                    <span><b className="text-[0.95rem]">{t}.</b> <span className="text-sm text-ink-500">{d}</span></span>
                  </li>
                ))}
              </ol>
              <div className="mt-6 rounded-xl bg-brand-50 border border-brand-100 p-4 text-[0.83rem] text-brand-800">
                <b>Sandbox tip:</b> NIN <code className="font-mono">12345678901</code> succeeds.
                Endings <code className="font-mono">99</code> simulate provider timeout (auto-refund),
                <code className="font-mono"> 00</code> simulate an invalid ID.
              </div>
            </div>
          </div>
        </section>

        {/* Trust strip */}
        <section className="border-b border-mist-200 bg-white" aria-label="Assurances">
          <div className="mx-auto max-w-6xl px-4 py-4 flex flex-wrap gap-x-8 gap-y-2 text-sm font-medium text-ink-700">
            {[['Ledger-based wallet', 'Every kobo accounted for'], ['Provider failover', 'Automatic retries'], ['Masked PII', 'Privacy by design'], ['Audit logs', 'Full traceability']].map(([t, d]) => (
              <span key={t} className="inline-flex items-center gap-2">
                <Check size={16} className="text-brand-600" aria-hidden="true" /><b>{t}</b><span className="text-ink-500 hidden sm:inline">· {d}</span>
              </span>
            ))}
          </div>
        </section>

        {/* Services */}
        <section id="services" className="mx-auto max-w-6xl px-4 py-14 sm:py-16 scroll-mt-16">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-600">Services</p>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1.5">One wallet, every check your business needs</h2>
            </div>
            <Link to="/register" className="btn-ghost btn-sm self-start sm:self-auto">Browse all services<ArrowRight size={15} /></Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
            {SERVICE_TILES.map((s) => (
              <div key={s.t} className="card card-hover p-5 group">
                <span className="grid place-items-center w-11 h-11 rounded-xl bg-brand-900 text-gold-300 group-hover:bg-brand-800 transition-colors" aria-hidden="true">{s.icon}</span>
                <h3 className="font-bold mt-3 group-hover:text-brand-700 transition-colors">{s.t}</h3>
                <p className="text-sm text-ink-500 mt-1">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Split: security + developers */}
        <section id="security" className="bg-mist-50 border-y border-mist-200 scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-14 grid lg:grid-cols-2 gap-4">
            <div className="card p-6 sm:p-7">
              <span className="grid place-items-center w-11 h-11 rounded-xl bg-brand-50 text-brand-700 border border-brand-100" aria-hidden="true"><Lock size={22} /></span>
              <h3 className="font-extrabold text-lg mt-3">Security &amp; trust, engineered in</h3>
              <ul className="mt-3 space-y-2 text-sm text-ink-700">
                {['Hashed passwords, short-lived JWTs, rotating refresh tokens', 'Optional TOTP two-factor authentication', 'Hashed API secrets, IP allowlists, rate limits', 'Atomic ledger debits with idempotent refunds', 'Masked identity data across UI, receipts and logs'].map((t) => (
                  <li key={t} className="flex gap-2"><Check size={16} className="text-brand-600 shrink-0 mt-0.5" aria-hidden="true" />{t}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl p-6 sm:p-7 relative overflow-hidden text-white" style={{ background: 'linear-gradient(135deg, #0a3f2a, #031810)' }}>
              <div className="absolute inset-0 hero-grid" aria-hidden="true" />
              <div className="relative">
                <span className="grid place-items-center w-11 h-11 rounded-xl bg-white/10 text-gold-300" aria-hidden="true"><Zap size={22} /></span>
                <h3 className="font-extrabold text-lg mt-3">Built for developers</h3>
                <p className="text-sm text-white/70 mt-1">Versioned REST API, one-time secrets, rotation, signed webhooks, usage dashboards and request logs.</p>
                <div className="codeblock p-4 mt-4 overflow-x-auto">
                  <span className="text-white/40"># verify a NIN</span><br />
                  curl -X POST $BASE/api/v1/verify/nin-verification \<br />
                  &nbsp;&nbsp;-H <span className="text-gold-300">"Authorization: Bearer PREFIX.SECRET"</span> \<br />
                  &nbsp;&nbsp;-d <span className="text-gold-300">'{"{`nin`}"}: "12345678901"'</span>
                </div>
                <Link to="/docs" className="inline-flex items-center gap-2 mt-4 text-sm font-bold text-gold-300 hover:underline">Read the docs<ArrowRight size={15} /></Link>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="how" className="mx-auto max-w-6xl px-4 py-14 scroll-mt-16">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-600">FAQ</p>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1.5">Frequently asked questions</h2>
          <div className="grid lg:grid-cols-2 gap-3.5 mt-6">
            {FAQS.map((f) => (
              <details key={f.q} className="card p-5 group">
                <summary className="font-bold cursor-pointer list-none flex justify-between items-center gap-3">
                  {f.q}<ChevronDown size={16} className="shrink-0 text-brand-600 transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <p className="text-sm text-ink-500 mt-2">{f.a}</p>
              </details>
            ))}
          </div>
          <div className="card mt-6 p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between" style={{ background: 'linear-gradient(120deg, #ecf7f0, #fff)' }}>
            <div>
              <h3 className="font-extrabold text-xl">Start verifying in minutes</h3>
              <p className="text-sm text-ink-500 mt-1">Free to join. Fund your wallet only when you're ready to run checks.</p>
            </div>
            <Link to="/register" className="btn-primary">Create free account<ArrowRight size={16} /></Link>
          </div>
        </section>
      </main>

      <footer className="text-white" style={{ background: '#031810' }}>
        <div className="mx-auto max-w-6xl px-4 py-10 grid sm:grid-cols-3 gap-6 text-sm">
          <div>
            <Logo dark />
            <p className="text-white/55 mt-3 max-w-xs">Secure Nigerian identity verification for businesses, fintechs and developers.</p>
          </div>
          <nav aria-label="Product">
            <p className="font-bold mb-2 text-white/85">Product</p>
            <div className="flex flex-col gap-1.5 text-white/60">
              <a href="#services" className="hover:text-white">Services</a>
              <Link to="/docs" className="hover:text-white">API docs</Link>
              <Link to="/register" className="hover:text-white">Pricing (in-app)</Link>
            </div>
          </nav>
          <div>
            <p className="font-bold mb-2 text-white/85">Contact</p>
            <p className="text-white/60">support@example.com</p>
            <p className="text-white/40 text-xs mt-3">© 2026 NaijaVerify. Sandbox — connect real providers before handling live citizen data.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ================= Auth layout ================= */
function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <Shell>
      <div className="min-h-screen grid lg:grid-cols-2">
        <div className="hidden lg:flex flex-col justify-between p-10 text-white relative overflow-hidden" style={{ background: 'linear-gradient(160deg, #0a3f2a 0%, #031810 100%)' }}>
          <div className="absolute inset-0 hero-grid" aria-hidden="true" />
          <div className="absolute inset-0" aria-hidden="true" style={{ background: 'radial-gradient(520px 300px at 20% 10%, rgba(31,138,93,0.4), transparent), radial-gradient(420px 260px at 90% 90%, rgba(212,181,63,0.14), transparent)' }} />
          <Link to="/" className="relative"><Logo dark /></Link>
          <div className="relative">
            <h2 className="text-3xl font-extrabold tracking-tight leading-tight">Identity infrastructure<br />for Nigerian business.</h2>
            <ul className="mt-6 space-y-3 text-sm text-white/75">
              {[['Wallet & ledger', 'Every kobo traceable, refunds automatic'], ['Failover engine', 'Multiple providers, one reliable result'], ['Developer-first', 'Keys, webhooks, logs and docs']].map(([t, d]) => (
                <li key={t} className="flex gap-3">
                  <span className="grid place-items-center w-8 h-8 rounded-lg bg-white/10 shrink-0" aria-hidden="true"><Check size={16} className="text-gold-300" /></span>
                  <span><b className="text-white">{t}.</b> {d}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="relative text-xs text-white/40">Protected by audited, masked-data architecture.</p>
        </div>
        <div className="flex items-center justify-center px-4 py-10 bg-mist-50">
          <div className="w-full max-w-md">
            <Link to="/" className="lg:hidden inline-block mb-6"><Logo /></Link>
            <div className="card p-6 sm:p-8">
              <h1 className="text-[1.5rem] font-extrabold tracking-tight">{title}</h1>
              <p className="text-sm text-ink-500 mt-1 mb-6">{subtitle}</p>
              {children}
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

export function Login() {
  const nav = useNavigate();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [error, setError] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');

  function enter(r: any) {
    setTokens(r.data.accessToken, r.data.refreshToken);
    saveUser(r.data.user);
    nav(r.data.user.role === 'customer' || r.data.user.role === 'reseller' || r.data.user.role === 'api_customer' ? '/app' : '/admin');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(form) });
      if (r.data?.twoFactorRequired) setChallenge(r.data.challengeId);
      else enter(r);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function verify2fa(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api('/api/auth/2fa/verify', { method: 'POST', body: JSON.stringify({ challengeId: challenge, code }) });
      enter(r);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Log in to your verification workspace.">
      <InlineError error={error} />
      {challenge ? (
        <form onSubmit={verify2fa}>
          <p className="text-sm text-ink-500 mb-4 flex items-center gap-2"><Smartphone size={16} /> Two-factor enabled — enter the code from your authenticator app.</p>
          <Field label="Authenticator code" htmlFor="code">
            <input id="code" className="input font-mono text-center text-lg tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required />
          </Field>
          <Button className="w-full" loading={busy}>Verify &amp; log in</Button>
        </form>
      ) : (
        <form onSubmit={submit}>
          <Field label="Email, username or phone" htmlFor="identifier">
            <input id="identifier" className="input" autoComplete="username" placeholder="you@example.com" value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} required />
          </Field>
          <Field label="Password" htmlFor="password">
            <input id="password" type="password" className="input" autoComplete="current-password" placeholder="••••••••" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </Field>
          <Button className="w-full" loading={busy}>Log in</Button>
        </form>
      )}
      <div className="mt-5 text-sm flex justify-between">
        <Link to="/register" className="text-brand-700 font-semibold hover:underline">Create account</Link>
        <Link to="/forgot" className="text-brand-700 font-semibold hover:underline">Forgot password?</Link>
      </div>
    </AuthShell>
  );
}

export function Register() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({
    firstName: '', lastName: '', username: '', email: '', phone: '',
    password: '', confirmPassword: '', referralCode: params.get('ref') || '', terms: false as boolean,
  });
  const [error, setError] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [verifyToken, setVerifyToken] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: any = { ...form };
      if (!payload.referralCode) delete payload.referralCode;
      const r = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) });
      if (r.data?.emailVerifyToken) setVerifyToken(r.data.emailVerifyToken);
      else nav('/login');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    try {
      await api('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ token: verifyToken }) });
      nav('/login');
    } catch (e) {
      setError(e);
    }
  }

  const set = (k: string, v: any) => setForm({ ...form, [k]: v });

  return (
    <AuthShell title="Create your account" subtitle="Free to join. Fund your wallet when you're ready.">
      <InlineError error={error} />
      {verifyToken ? (
        <div className="text-center py-4">
          <span className="mx-auto mb-3 grid place-items-center w-12 h-12 rounded-2xl bg-brand-50 text-brand-700" aria-hidden="true"><Check size={26} /></span>
          <p className="font-bold">Account created</p>
          <p className="text-sm text-ink-500 mt-1 mb-4">One last step — verify your email to activate the account.</p>
          <Button className="w-full" onClick={verify}>Verify email &amp; continue</Button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="First name" htmlFor="fn"><input id="fn" className="input" autoComplete="given-name" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required /></Field>
            <Field label="Last name" htmlFor="ln"><input id="ln" className="input" autoComplete="family-name" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} required /></Field>
          </div>
          <Field label="Username" htmlFor="un" hint="Letters, numbers, dots and underscores."><input id="un" className="input" autoComplete="username" value={form.username} onChange={(e) => set('username', e.target.value)} required /></Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Email" htmlFor="em"><input id="em" type="email" className="input" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} required /></Field>
            <Field label="Phone" htmlFor="ph"><input id="ph" className="input" autoComplete="tel" placeholder="0803…" value={form.phone} onChange={(e) => set('phone', e.target.value)} required /></Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Password" htmlFor="pw" hint="Minimum 8 characters."><input id="pw" type="password" className="input" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} required /></Field>
            <Field label="Confirm password" htmlFor="cpw"><input id="cpw" type="password" className="input" autoComplete="new-password" value={form.confirmPassword} onChange={(e) => set('confirmPassword', e.target.value)} required /></Field>
          </div>
          <Field label="Referral code (optional)" htmlFor="ref"><input id="ref" className="input font-mono" placeholder="NV-XXXXXX" value={form.referralCode} onChange={(e) => set('referralCode', e.target.value)} /></Field>
          <label className="flex items-start gap-2.5 text-sm mb-5 cursor-pointer">
            <input type="checkbox" checked={form.terms} onChange={(e) => set('terms', e.target.checked)} required className="mt-1 w-4 h-4 accent-green-800" />
            <span>I accept the terms of use and consent to identity-data processing for verification.</span>
          </label>
          <Button className="w-full" loading={busy}>Create account</Button>
        </form>
      )}
      <div className="mt-5 text-sm text-center"><Link to="/login" className="text-brand-700 font-semibold hover:underline">Already have an account? Log in</Link></div>
    </AuthShell>
  );
}

export function Forgot() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function req(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
      setMsg(r.message);
      if (r.data?.resetToken) setToken(r.data.resetToken);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function reset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
      setMsg('Password reset. You can now log in.');
    } catch (e) {
      setError(e);
    }
  }
  return (
    <AuthShell title="Password recovery" subtitle="We'll issue a reset token for your account.">
      <InlineError error={error} />
      {msg && <p className="text-sm text-brand-700 bg-brand-50 border border-brand-100 rounded-xl px-4 py-3 mb-4" role="status">{msg}</p>}
      <form onSubmit={req} className="mb-5">
        <Field label="Email" htmlFor="em"><input id="em" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Button variant="ghost" className="w-full" loading={busy}>Request reset token</Button>
      </form>
      {token && (
        <form onSubmit={reset} className="border-t border-mist-100 pt-5">
          <Field label="Reset token" htmlFor="tok"><input id="tok" className="input font-mono" value={token} onChange={(e) => setToken(e.target.value)} required /></Field>
          <Field label="New password" htmlFor="npw"><input id="npw" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
          <Button className="w-full">Reset password</Button>
        </form>
      )}
      <div className="mt-5 text-sm text-center"><Link to="/login" className="text-brand-700 font-semibold hover:underline">Back to login</Link></div>
    </AuthShell>
  );
}