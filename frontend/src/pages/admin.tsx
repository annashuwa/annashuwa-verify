import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  LayoutDashboard, Grid2x2, Users, UserRound, UserCheck, Server, Receipt, FileBarChart,
  FileText, ScrollText, Settings, LifeBuoy, Bell, Search, Menu, X, LogOut, TrendingUp,
  TrendingDown, CircleDollarSign, Landmark, Clock, Ban, CircleCheck, ArrowDownLeft,
  KeyRound, ShieldCheck, Eye, Plus, RefreshCw, Power, Download, Send, Zap,
  Lock, Gauge, ChevronRight, ChevronLeft, Activity,
} from 'lucide-react';
import { api, kobo, clearTokens, getAccess } from '../lib/api';
import { useUser } from '../components/ui';
import { onNotificationsChanged, notifyNotificationsChanged } from '../lib/notifBus';
import {
  Logo, Avatar, Button, Field, Badge, EmptyState, ErrorState, InlineError,
  Skeleton, SkeletonCards, SkeletonTable, Tabs, Pagination,
  toast, confirmDialog, promptDialog,
} from '../components/kit';
import {
  AdminPageHeader, StatCard, ChartCard, AreaChart, Donut, HBars, DetailGrid,
  SectionTitle, FilterBar, fmtDate, fmtDateTime, timeAgo,
} from '../components/admin';

/* ================= navigation model ================= */
interface NavLeaf { label: string; href: string; icon: ReactNode }
interface NavGroup { label: string; icon: ReactNode; items: NavLeaf[] }

const NAV: NavGroup[] = [
  {
    label: 'Overview', icon: <LayoutDashboard size={19} />,
    items: [
      { label: 'Dashboard', href: '/admin', icon: <LayoutDashboard size={18} /> },
      { label: 'Analytics', href: '/admin/analytics', icon: <TrendingUp size={18} /> },
    ],
  },
  {
    label: 'Verifications', icon: <Receipt size={19} />,
    items: [
      { label: 'All Verifications', href: '/admin/transactions', icon: <Receipt size={18} /> },
      { label: 'Successful', href: '/admin/transactions?status=successful', icon: <CircleCheck size={18} /> },
      { label: 'Pending', href: '/admin/transactions?status=processing', icon: <Clock size={18} /> },
      { label: 'Failed', href: '/admin/transactions?status=failed', icon: <Ban size={18} /> },
      { label: 'Refunded', href: '/admin/transactions?status=refunded', icon: <ArrowDownLeft size={18} /> },
      { label: 'Services', href: '/admin/services', icon: <Grid2x2 size={18} /> },
      { label: 'KYC Requests', href: '/admin/kyc', icon: <UserCheck size={18} /> },
    ],
  },
  {
    label: 'Customers', icon: <Users size={19} />,
    items: [{ label: 'All Customers', href: '/admin/users', icon: <Users size={18} /> }],
  },
  {
    label: 'Providers & API', icon: <Server size={19} />,
    items: [
      { label: 'API Providers', href: '/admin/providers', icon: <Server size={18} /> },
      { label: 'API Logs', href: '/admin/api-logs', icon: <ScrollText size={18} /> },
    ],
  },
  {
    label: 'Finance', icon: <CircleDollarSign size={19} />,
    items: [
      { label: 'Financial Overview', href: '/admin/finance', icon: <Landmark size={18} /> },
      { label: 'Pricing', href: '/admin/pricing', icon: <FileText size={18} /> },
      { label: 'Reports', href: '/admin/reports', icon: <FileBarChart size={18} /> },
    ],
  },
  {
    label: 'Team', icon: <ShieldCheck size={19} />,
    items: [
      { label: 'Team Members', href: '/admin/team', icon: <UserRound size={18} /> },
      { label: 'Roles & Permissions', href: '/admin/roles', icon: <KeyRound size={18} /> },
      { label: 'Audit Logs', href: '/admin/audit', icon: <ShieldCheck size={18} /> },
      { label: 'Notifications', href: '/admin/notifications', icon: <Bell size={18} /> },
      { label: 'Support Tickets', href: '/admin/support', icon: <LifeBuoy size={18} /> },
    ],
  },
  {
    label: 'System', icon: <Settings size={19} />,
    items: [{ label: 'Settings', href: '/admin/settings', icon: <Settings size={18} /> }],
  },
];

function activeFor(href: string, pathname: string, search: string): boolean {
  const u = new URL(href, 'http://x');
  if (u.pathname === '/admin') return pathname === '/admin';
  if (pathname === u.pathname) {
    if (!u.search) return !search;
    return search === u.search;
  }
  if (!u.search && pathname.startsWith(u.pathname + '/')) return true;
  return false;
}

const CRUMBS: Record<string, string[]> = {
  '/admin': ['Dashboard'],
  '/admin/analytics': ['Dashboard', 'Analytics'],
  '/admin/transactions': ['Verifications', 'All Verifications'],
  '/admin/services': ['Verifications', 'Services'],
  '/admin/kyc': ['Verifications', 'KYC Requests'],
  '/admin/users': ['Customers', 'All Customers'],
  '/admin/providers': ['Providers & API', 'API Providers'],
  '/admin/api-logs': ['Providers & API', 'API Logs'],
  '/admin/finance': ['Finance', 'Financial Overview'],
  '/admin/pricing': ['Finance', 'Pricing'],
  '/admin/reports': ['Finance', 'Reports'],
  '/admin/team': ['Team', 'Team Members'],
  '/admin/roles': ['Team', 'Roles & Permissions'],
  '/admin/audit': ['Team', 'Audit Logs'],
  '/admin/notifications': ['Team', 'Notifications'],
  '/admin/support': ['Team', 'Support Tickets'],
  '/admin/settings': ['System', 'Settings'],
};

function crumbsFor(pathname: string, search: string): string[] {
  if (pathname === '/admin/transactions' && search.includes('status=successful')) return ['Verifications', 'Successful'];
  if (pathname === '/admin/transactions' && search.includes('status=processing')) return ['Verifications', 'Pending'];
  if (pathname === '/admin/transactions' && search.includes('status=failed')) return ['Verifications', 'Failed'];
  if (pathname === '/admin/transactions' && search.includes('status=refunded')) return ['Verifications', 'Refunded'];
  if (pathname.startsWith('/admin/users/')) return ['Customers', 'All Customers', 'Profile'];
  return CRUMBS[pathname] ?? ['Admin'];
}

/* ================= admin shell ================= */
export function AdminLayout({ children }: { children: ReactNode }) {
  const [user] = useUser();
  const nav = useNavigate();
  const loc = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('nv_admin_collapsed') === '1';
    } catch {
      return false;
    }
  });
  const [drawer, setDrawer] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('nv_admin_groups') || 'null');
      if (Array.isArray(saved) && saved.length > 0) return saved;
    } catch { /* fall through */ }
    return NAV.filter((g) => g.items.some((it) => activeFor(it.href, loc.pathname, loc.search))).map((g) => g.label);
  });
  const [q, setQ] = useState('');
  const [alertCount, setAlertCount] = useState(0);
  const [sysOk, setSysOk] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('nv_admin_collapsed', collapsed ? '1' : '0');
    } catch { /* ignore */ }
  }, [collapsed]);
  useEffect(() => {
    try {
      localStorage.setItem('nv_admin_groups', JSON.stringify(openGroups));
    } catch { /* ignore */ }
  }, [openGroups]);

  // Keep the active group open on navigation.
  useEffect(() => {
    setDrawer(false);
    const g = NAV.find((grp) => grp.items.some((it) => activeFor(it.href, loc.pathname, loc.search)));
    if (g) setOpenGroups((prev) => (prev.includes(g.label) ? prev : [...prev, g.label]));
  }, [loc.pathname, loc.search]);

  // Header signals: personal unread + derived system alerts (all real data).
  const refreshHeader = useCallback(async () => {
    try {
      const [n, ov, prov] = await Promise.all([
        api('/api/notifications').catch(() => null),
        api('/api/admin/overview').catch(() => null),
        api('/api/admin/providers').catch(() => null),
      ]);
      let alerts = 0;
      if (n) alerts += Number(n.unread ?? 0);
      const providers: any[] = prov?.data ?? [];
      alerts += providers.filter((p: any) => p.lowBalance && p.configured !== false).length;
      alerts += providers.filter((p: any) => ['offline', 'degraded'].includes(p.status)).length;
      setAlertCount(alerts);
    } catch { /* header must never break pages */ }
    try {
      const h = await fetch('/health');
      setSysOk(h.ok);
    } catch {
      setSysOk(false);
    }
  }, []);

  useEffect(() => {
    refreshHeader();
    return onNotificationsChanged(refreshHeader);
  }, [refreshHeader]);

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    } catch { /* ignore */ }
    clearTokens();
    try {
      localStorage.removeItem('nv_user');
    } catch { /* ignore */ }
    nav('/login');
  }

  function toggleGroup(label: string) {
    setOpenGroups((prev) => (prev.includes(label) ? prev.filter((g) => g !== label) : [...prev, label]));
  }

  const crumbs = crumbsFor(loc.pathname, loc.search);

  const sidebar = (
    <div className="flex flex-col h-full">
      <Link to="/admin" className="flex items-center gap-2.5 px-4 h-16 shrink-0 border-b border-white/10" aria-label="NaijaVerify admin home">
        <Logo compact />
        {!collapsed && (
          <span className="min-w-0">
            <span className="block font-extrabold text-white text-[0.95rem] leading-tight truncate">NaijaVerify</span>
            <span className="block text-[0.68rem] font-bold uppercase tracking-[0.14em] text-gold-400">Admin Console</span>
          </span>
        )}
      </Link>
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-1" aria-label="Admin navigation">
        {NAV.map((g) => {
          const open = openGroups.includes(g.label);
          const hasActive = g.items.some((it) => activeFor(it.href, loc.pathname, loc.search));
          if (collapsed) {
            return (
              <button
                key={g.label}
                onClick={() => {
                  setCollapsed(false);
                  if (!open) toggleGroup(g.label);
                }}
                title={g.label}
                aria-label={`Expand ${g.label}`}
                className={`w-full grid place-items-center h-11 rounded-xl transition-colors ${hasActive ? 'bg-white/15 text-gold-300' : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
              >
                {g.icon}
              </button>
            );
          }
          return (
            <div key={g.label}>
              <button
                onClick={() => toggleGroup(g.label)}
                aria-expanded={open}
                className={`w-full flex items-center gap-2.5 px-3 h-9 rounded-lg text-[0.7rem] font-extrabold uppercase tracking-[0.12em] transition-colors ${hasActive ? 'text-gold-300' : 'text-white/45 hover:text-white/80'}`}
              >
                <span className="flex-1 text-left truncate">{g.label}</span>
                <ChevronRight size={15} className={`transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
              </button>
              {open && (
                <ul className="mt-0.5 mb-1.5 space-y-0.5">
                  {g.items.map((it) => {
                    const active = activeFor(it.href, loc.pathname, loc.search);
                    return (
                      <li key={it.href + it.label}>
                        <Link
                          to={it.href}
                          aria-current={active ? 'page' : undefined}
                          className={`flex items-center gap-2.5 px-3 h-10 rounded-xl text-sm font-medium transition-colors ${active ? 'bg-white/15 text-white font-bold shadow-[inset_2px_0_0_#d4b53f]' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}
                        >
                          <span className={active ? 'text-gold-300' : ''} aria-hidden="true">{it.icon}</span>
                          <span className="truncate">{it.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
      {!collapsed && (
        <div className="p-3 border-t border-white/10">
          <div className={`flex items-center gap-2 text-xs font-semibold px-2 py-1.5 rounded-lg ${sysOk === false ? 'text-red-300' : 'text-emerald-300'}`}>
            <span className={`w-2 h-2 rounded-full ${sysOk === false ? 'bg-red-400' : sysOk ? 'bg-emerald-400 animate-pulse' : 'bg-white/30'}`} aria-hidden="true" />
            {sysOk === false ? 'System unreachable' : sysOk ? 'All systems normal' : 'Checking systems…'}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-mist-50">
      {/* desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col fixed inset-y-0 left-0 z-40 bg-gradient-to-b from-emerald-950 via-brand-950 to-brand-900 transition-[width] duration-200 ${collapsed ? 'w-[76px]' : 'w-[264px]'}`}
        aria-label="Admin sidebar"
      >
        {sidebar}
      </aside>
      {/* mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin menu">
          <div className="absolute inset-0 bg-brand-950/60 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] bg-gradient-to-b from-emerald-950 via-brand-950 to-brand-900 shadow-2xl">
            {sidebar}
          </aside>
        </div>
      )}
      <div className={`transition-[padding] duration-200 ${collapsed ? 'lg:pl-[76px]' : 'lg:pl-[264px]'}`}>
        {/* header */}
        <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-xl border-b border-mist-200">
          <div className="flex items-center gap-2 px-3 sm:px-5 h-16">
            <button className="lg:hidden btn-ghost btn-sm !px-2.5" onClick={() => setDrawer(true)} aria-label="Open admin menu">
              <Menu size={19} />
            </button>
            <button
              className="hidden lg:inline-flex btn-ghost btn-sm !px-2.5"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <Menu size={19} />
            </button>
            <nav className="hidden md:flex items-center gap-1.5 text-sm min-w-0" aria-label="Breadcrumb">
              {crumbs.map((c, i) => (
                <span key={i} className="flex items-center gap-1.5 min-w-0">
                  {i > 0 && <ChevronRight size={14} className="text-ink-400 shrink-0" aria-hidden="true" />}
                  <span className={i === crumbs.length - 1 ? 'font-bold text-ink-900 truncate' : 'text-ink-500 truncate'}>{c}</span>
                </span>
              ))}
            </nav>
            <form
              className="hidden md:flex relative ml-4 w-64"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                if (q.trim()) nav(`/admin/users?q=${encodeURIComponent(q.trim())}`);
              }}
            >
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
              <input
                className="input !rounded-full !pl-9 !min-h-[38px] !py-1.5 text-sm"
                placeholder="Search customers…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search customers"
              />
            </form>
            <div className="ml-auto flex items-center gap-1.5">
              <span className={`hidden sm:inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${sysOk === false ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`} title="Backend reachability">
                <span className={`w-1.5 h-1.5 rounded-full ${sysOk === false ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`} aria-hidden="true" />
                {sysOk === false ? 'Offline' : 'Live'}
              </span>
              <Link to="/admin/notifications" className="relative btn-ghost btn-sm !px-2.5" aria-label={`Notifications${alertCount > 0 ? `, ${alertCount} unread` : ''}`}>
                <Bell size={19} />
                {alertCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-red-600 text-white text-[0.65rem] font-extrabold" aria-hidden="true">
                    {alertCount > 99 ? '99+' : alertCount}
                  </span>
                )}
              </Link>
              <span className="hidden sm:flex items-center gap-2 pl-1.5">
                <Avatar name={`${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email || 'Admin'} size={34} />
                <span className="min-w-0 hidden xl:block">
                  <span className="block text-sm font-bold leading-tight truncate max-w-[140px]">{user?.firstName} {user?.lastName}</span>
                  <span className="block text-[0.7rem] text-ink-500 capitalize leading-tight">{user?.role?.replace('_', ' ')}</span>
                </span>
              </span>
              <button onClick={logout} className="btn-ghost btn-sm !px-2.5" aria-label="Logout" title="Logout">
                <LogOut size={18} />
              </button>
            </div>
          </div>
          {/* mobile search row */}
          <form
            className="md:hidden px-3 pb-2.5 relative"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) nav(`/admin/users?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <Search size={16} className="absolute left-6 top-1/2 -translate-y-[calc(50%+5px)] text-ink-400" aria-hidden="true" />
            <input
              className="input !rounded-full !pl-9 !min-h-[38px] !py-1.5 text-sm"
              placeholder="Search customers…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search customers"
            />
          </form>
        </header>
        <main className="p-3 sm:p-5 lg:p-6 max-w-[1400px] mx-auto w-full">{children}</main>
      </div>
    </div>
  );
}

/* ================= status helpers ================= */
const TX_TABS = [
  { value: '', label: 'All' },
  { value: 'successful', label: 'Successful' },
  { value: 'processing', label: 'Pending' },
  { value: 'failed', label: 'Failed' },
  { value: 'refunded', label: 'Refunded' },
];

/* ================= dashboard ================= */
export function AdminOverview() {
  const [d, setD] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [refunds, setRefunds] = useState<any>(null);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ov, tx, rep] = await Promise.all([
          api('/api/admin/overview'),
          api('/api/admin/transactions?limit=8').catch(() => null),
          api('/api/admin/reports/summary').catch(() => null),
        ]);
        if (cancelled) return;
        setD(ov.data);
        setRecent(tx?.data ?? []);
        setRefunds(rep?.data?.refunds ?? null);
      } catch (e) {
        if (!cancelled) setError(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="page-in">
        <AdminPageHeader title="Dashboard" subtitle="Platform command center." />
        <ErrorState message={String(error.body?.message || error.message)} onRetry={() => location.reload()} />
      </div>
    );
  }
  if (!d) {
    return (
      <div className="page-in">
        <Skeleton className="h-8 w-56 mb-5" />
        <SkeletonCards n={5} />
      </div>
    );
  }

  const t = d.transactions;
  const chartPoints = (d.revenueSeries ?? []).map((r: any) => ({ label: String(r._id).slice(5), value: r.revenue }));
  const statusSegs = [
    { label: 'Successful', value: t.successful, color: '#14724c' },
    { label: 'Failed', value: t.failed, color: '#d92d20' },
    { label: 'Pending', value: t.pending, color: '#dc6803' },
  ];

  return (
    <div className="page-in">
      <AdminPageHeader
        title="Dashboard"
        subtitle={`${fmtDateTime(new Date())} · Every figure below is live platform data.`}
        actions={<Link to="/admin/analytics" className="btn-ghost btn-sm"><TrendingUp size={15} /> Analytics</Link>}
      />

      <SectionTitle title="Verification statistics" />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-2">
        <StatCard icon={<Receipt size={20} />} label="Total verifications" value={String(t.total)} sub="all time" tone="brand" />
        <StatCard icon={<CircleCheck size={20} />} label="Successful" value={String(t.successful)} sub={t.total ? `${Math.round((t.successful / t.total) * 100)}% success rate` : 'no data yet'} tone="green" />
        <StatCard icon={<Ban size={20} />} label="Failed" value={String(t.failed)} sub="incl. refund-pending" tone="red" />
        <StatCard icon={<Clock size={20} />} label="Pending" value={String(t.pending)} sub="created · pending · processing" tone="amber" />
        <StatCard icon={<ArrowDownLeft size={20} />} label="Refunded" value={refunds ? String(refunds.count) : '—'} sub={refunds ? `${kobo(refunds.total)} returned` : 'loading…'} tone="slate" />
      </div>

      <SectionTitle title="Financial statistics" />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-2">
        <StatCard icon={<CircleDollarSign size={20} />} label="Today revenue" value={kobo(d.today.revenue || 0)} sub={`Profit ${kobo(d.today.profit || 0)}`} tone="green" />
        <StatCard icon={<Landmark size={20} />} label="Month revenue" value={kobo(d.month.revenue || 0)} sub={`Profit ${kobo(d.month.profit || 0)}`} tone="brand" />
        <StatCard icon={<TrendingUp size={20} />} label="Month profit" value={kobo(d.month.profit || 0)} sub={`Cost ${kobo(d.month.cost || 0)}`} tone="gold" />
        <StatCard icon={<Gauge size={20} />} label="Wallet liability" value={kobo(d.walletLiabilityKobo)} sub="owed to customers" tone="indigo" />
        <StatCard icon={<Server size={20} />} label="Provider float" value={kobo(d.providerBalances.reduce((s: number, p: any) => s + p.balanceKobo, 0))} sub={`${d.providerBalances.length} providers`} tone="slate" />
      </div>

      <SectionTitle title="Customer statistics" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard icon={<Users size={20} />} label="Total customers" value={String(d.users.total)} sub="all accounts" tone="brand" />
        <StatCard icon={<UserCheck size={20} />} label="Active" value={String(d.users.active)} sub={d.users.total ? `${Math.round((d.users.active / d.users.total) * 100)}% of total` : ''} tone="green" />
        <StatCard icon={<UserRound size={20} />} label="Inactive / other" value={String(Math.max(0, d.users.total - d.users.active))} sub="pending + suspended" tone="amber" />
        <StatCard icon={<Activity size={20} />} label="Avg checks / customer" value={d.users.total ? (t.total / d.users.total).toFixed(1) : '—'} sub="all-time verifications" tone="slate" />
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-4 items-start mb-4">
        <ChartCard
          title="Revenue — last 14 days"
          subtitle="Successful verification sales only. Wallet funding is never revenue."
          action={<Link to="/admin/finance" className="text-xs font-bold text-brand-700 hover:underline inline-flex items-center gap-0.5">Finance <ChevronRight size={14} /></Link>}
        >
          <AreaChart points={chartPoints} formatY={(v) => kobo(v)} />
        </ChartCard>
        <ChartCard title="Outcomes" subtitle="All-time verification results.">
          <Donut segments={statusSegs} />
        </ChartCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <ChartCard
          title="Top services"
          subtitle="By successful verification count."
          action={<Link to="/admin/services" className="text-xs font-bold text-brand-700 hover:underline inline-flex items-center gap-0.5">Services <ChevronRight size={14} /></Link>}
        >
          <HBars rows={(d.byService ?? []).map((s: any) => ({ label: s._id, value: s.count, sub: kobo(s.revenue) }))} />
        </ChartCard>
        <ChartCard
          title="Recent verifications"
          subtitle="Latest platform activity."
          action={<Link to="/admin/transactions" className="text-xs font-bold text-brand-700 hover:underline inline-flex items-center gap-0.5">View all <ChevronRight size={14} /></Link>}
        >
          {recent.length === 0 ? (
            <p className="text-sm text-ink-500 py-4 text-center">No verifications yet.</p>
          ) : (
            <ul className="divide-y divide-mist-100">
              {recent.map((t: any) => (
                <li key={t.txId}>
                  <Link to={`/admin/transactions?txId=${encodeURIComponent(t.txId)}`} className="flex items-center gap-3 py-2.5 group min-w-0">
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs font-bold truncate group-hover:text-brand-700">{t.txId}</span>
                      <span className="block text-xs text-ink-500 truncate">{t.user?.name ?? '—'} · {t.serviceSlug}</span>
                    </span>
                    <b className="tnum text-sm shrink-0">{kobo(t.amountKobo)}</b>
                    <Badge status={t.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

/* ================= analytics ================= */
const RANGES = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'custom', label: 'Custom' },
];

function rangeToDates(range: string, from: string, to: string): { from?: string; to?: string } {
  const now = new Date();
  if (range === 'today') {
    const d = now.toISOString().slice(0, 10);
    return { from: d, to: d };
  }
  if (range === '7d' || range === '30d') {
    const days = range === '7d' ? 7 : 30;
    const f = new Date(now.getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);
    return { from: f, to: now.toISOString().slice(0, 10) };
  }
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

export function AdminAnalytics() {
  const [ov, setOv] = useState<any>(null);
  const [rep, setRep] = useState<any>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [range, setRange] = useState('7d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState<any>(null);
  const [loadingRep, setLoadingRep] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [o, p] = await Promise.all([api('/api/admin/overview'), api('/api/admin/providers').catch(() => ({ data: [] }))]);
        if (!cancelled) {
          setOv(o.data);
          setProviders(p.data ?? []);
        }
      } catch (e) {
        if (!cancelled) setError(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadRange() {
    setLoadingRep(true);
    setError(null);
    try {
      const r = rangeToDates(range, from, to);
      const p = new URLSearchParams();
      if (r.from) p.set('from', r.from);
      if (r.to) p.set('to', new Date(new Date(r.to).getTime() + 86399999).toISOString());
      const res = await api(`/api/admin/reports/summary?${p.toString()}`);
      setRep(res.data);
    } catch (e) {
      setError(e);
    } finally {
      setLoadingRep(false);
    }
  }

  useEffect(() => {
    if (range !== 'custom') loadRange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, ov]);
  useEffect(() => {
    if (range === 'custom' && (from || to)) loadRange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error && !ov) {
    return (
      <div className="page-in">
        <AdminPageHeader title="Analytics" />
        <ErrorState message={String(error.body?.message || error.message)} onRetry={() => location.reload()} />
      </div>
    );
  }
  if (!ov) {
    return (
      <div className="page-in">
        <Skeleton className="h-8 w-48 mb-5" />
        <SkeletonCards n={4} />
      </div>
    );
  }

  const t = ov.transactions;
  const volumePoints = (ov.revenueSeries ?? []).map((r: any) => ({ label: String(r._id).slice(5), value: r.count }));
  const revenuePoints = (ov.revenueSeries ?? []).map((r: any) => ({ label: String(r._id).slice(5), value: r.revenue }));
  const statusSegs = [
    { label: 'Successful', value: t.successful, color: '#14724c' },
    { label: 'Failed', value: t.failed, color: '#d92d20' },
    { label: 'Pending', value: t.pending, color: '#dc6803' },
  ];
  const provRows = providers.map((p: any) => {
    const total = (p.successCount ?? 0) + (p.failCount ?? 0);
    return { label: p.name, value: total, sub: total ? `${Math.round(((p.successCount ?? 0) / total) * 100)}% ok` : 'no traffic' };
  });

  return (
    <div className="page-in">
      <AdminPageHeader title="Analytics" subtitle="Volume, outcomes, services, revenue and provider performance — all live data." />
      <FilterBar>
        <div className="flex flex-wrap gap-2 items-center" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              aria-pressed={range === r.value}
              className={`btn-sm rounded-full font-bold text-[0.8rem] px-3.5 py-1.5 transition-colors ${range === r.value ? 'bg-brand-900 text-white' : 'bg-white border border-mist-200 text-ink-600 hover:border-brand-300'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <>
            <input type="date" className="input !w-auto !min-h-[38px] text-sm" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
            <span className="text-ink-500 text-sm">to</span>
            <input type="date" className="input !w-auto !min-h-[38px] text-sm" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
            <Button size="sm" onClick={loadRange}>Apply</Button>
          </>
        )}
      </FilterBar>
      <InlineError error={error} />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <StatCard icon={<Receipt size={20} />} label="Checks in range" value={rep ? String(rep.sales.count) : '…'} sub={loadingRep ? 'loading…' : `${range === 'today' ? 'today' : range === 'custom' ? 'custom range' : `last ${range.replace('d', '')} days`}`} tone="brand" />
        <StatCard icon={<CircleDollarSign size={20} />} label="Revenue in range" value={rep ? kobo(rep.sales.revenue) : '…'} sub={rep ? `Cost ${kobo(rep.sales.providerCost)}` : ''} tone="green" />
        <StatCard icon={<TrendingUp size={20} />} label="Profit in range" value={rep ? kobo(rep.sales.profit) : '…'} sub={rep && rep.sales.revenue ? `${Math.round((rep.sales.profit / rep.sales.revenue) * 100)}% margin` : ''} tone="gold" />
        <StatCard icon={<Landmark size={20} />} label="Wallet funding" value={rep ? kobo(rep.walletFunding.total) : '…'} sub="liability, not revenue" tone="slate" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <ChartCard title="Verification volume" subtitle="Successful checks per day (last 14 days).">
          <AreaChart points={volumePoints} />
        </ChartCard>
        <ChartCard title="Revenue trend" subtitle="Sales revenue per day (last 14 days).">
          <AreaChart points={revenuePoints} formatY={(v) => kobo(v)} />
        </ChartCard>
        <ChartCard title="Successful vs failed" subtitle="All-time outcomes.">
          <Donut segments={statusSegs} />
        </ChartCard>
        <ChartCard title="Verification by service" subtitle="Successful checks and revenue per service.">
          <HBars rows={(ov.byService ?? []).map((s: any) => ({ label: s._id, value: s.count, sub: kobo(s.revenue) }))} />
        </ChartCard>
        <ChartCard
          title="Verification by provider"
          subtitle="Total requests handled per provider (success + fail counts)."
          className="lg:col-span-2"
        >
          <HBars rows={provRows} />
        </ChartCard>
      </div>
    </div>
  );
}

/* ================= transactions ================= */
function TxDetailModal({ tx, onClose, onRefunded }: { tx: any; onClose: () => void; onRefunded: () => void }) {
  const [busy, setBusy] = useState(false);
  const result = tx.result ?? {};
  const subject = result.subject ?? result.holder ?? null;

  async function refund() {
    const reason = await promptDialog({ title: `Refund ${tx.txId}`, label: 'Reason (shown to customer, audited)', initial: 'customer request' });
    if (!reason) return;
    setBusy(true);
    try {
      await api(`/api/admin/transactions/${tx.txId}/refund`, { method: 'POST', body: JSON.stringify({ reason }) });
      toast(`Transaction ${tx.txId} refunded`);
      onRefunded();
      onClose();
    } catch (e: any) {
      toast(e.body?.message || e.message || 'Refund failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={`Verification ${tx.txId}`}>
      <div className="absolute inset-0 bg-brand-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 page-in">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="min-w-0">
            <p className="font-mono text-sm font-extrabold break-all">{tx.txId}</p>
            <p className="text-xs text-ink-500 mt-0.5">{fmtDateTime(tx.createdAt)}{tx.updatedAt && tx.updatedAt !== tx.createdAt ? ` · updated ${fmtDateTime(tx.updatedAt)}` : ''}</p>
          </div>
          <span className="flex items-center gap-2 shrink-0">
            <Badge status={tx.status} />
            <button onClick={onClose} className="btn-ghost btn-sm !px-2" aria-label="Close details"><X size={17} /></button>
          </span>
        </div>

        <SectionTitle title="Request information" />
        <DetailGrid
          items={[
            { label: 'Customer', value: tx.user ? <><b>{tx.user.name}</b><span className="block text-xs text-ink-500 font-normal">{tx.user.email}</span></> : <span className="font-mono text-xs">{String(tx.userId).slice(-8)}</span> },
            { label: 'Service', value: <span className="font-mono text-[0.8rem]">{tx.serviceSlug}</span> },
            { label: 'Provider', value: tx.providerCode ? <span className="font-mono text-[0.8rem]">{tx.providerCode}</span> : '—' },
            { label: 'Provider reference', value: tx.providerRef ? <span className="font-mono text-[0.8rem]">{tx.providerRef}</span> : '—' },
            { label: 'Amount charged', value: <b className="tnum">{kobo(tx.amountKobo)}</b> },
            { label: 'Provider cost / profit', value: <span className="tnum">{kobo(tx.providerCostKobo)} / <b className="text-brand-700">{kobo(tx.profitKobo)}</b></span> },
            { label: 'Channel', value: <span className="capitalize">{tx.channel}</span> },
            ...(tx.errorCode || tx.errorMessage ? [{ label: 'Error', value: <span className="text-red-700">{tx.errorCode ? `${tx.errorCode} — ` : ''}{tx.errorMessage ?? ''}</span>, span: true }] : []),
          ]}
        />

        <SectionTitle title="Verification result" />
        {!tx.result ? (
          <p className="text-sm text-ink-500">No provider result recorded for this transaction.</p>
        ) : (
          <>
            {subject && (
              <>
                <p className="text-[0.72rem] font-bold uppercase tracking-wider text-ink-500 mb-1.5">Identity information</p>
                <div className="rounded-xl border border-mist-200 bg-mist-50/60 p-3.5 mb-3">
                  <DetailGrid
                    items={Object.entries(subject).map(([k, v]) => ({
                      label: k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
                      value: typeof v === 'object' ? <span className="font-mono text-xs">{JSON.stringify(v)}</span> : String(v ?? '—'),
                    }))}
                  />
                </div>
              </>
            )}
            <p className="text-[0.72rem] font-bold uppercase tracking-wider text-ink-500 mb-1.5">Provider response (minimized)</p>
            <pre className="rounded-xl border border-mist-200 bg-brand-950 text-emerald-50/90 text-[0.72rem] font-mono p-3.5 overflow-x-auto max-h-56 overflow-y-auto">
              {JSON.stringify({ message: result.message, verified: result.verified, operation: result.operation, facts: result.facts }, null, 2)}
            </pre>
          </>
        )}

        <SectionTitle title="Request metadata" />
        <DetailGrid
          items={[
            { label: 'Masked request', value: <span className="font-mono text-xs">{JSON.stringify(tx.requestMasked ?? {})}</span>, span: true },
            { label: 'Idempotency key', value: tx.idempotencyKey ? <span className="font-mono text-xs">{tx.idempotencyKey}</span> : '—' },
            { label: 'Source IP', value: tx.ip ? <span className="font-mono text-xs">{tx.ip}</span> : '—' },
          ]}
        />

        <div className="flex flex-wrap gap-2 mt-5">
          {['successful', 'failed'].includes(tx.status) && (
            <Button size="sm" onClick={refund} loading={busy}>Refund {kobo(tx.amountKobo)}</Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

export function AdminTransactions() {
  const [params] = useSearchParams();
  const urlStatus = params.get('status') ?? '';
  const urlTxId = params.get('txId') ?? '';
  const urlService = params.get('service') ?? '';
  const urlUserId = params.get('userId') ?? '';
  const [items, setItems] = useState<any[]>([]);
  const [status, setStatus] = useState(urlStatus);
  const [service, setService] = useState('');
  const [txSearch, setTxSearch] = useState(urlTxId);
  const [services, setServices] = useState<any[]>([]);
  const [userIdF, setUserIdF] = useState(urlUserId);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    api('/api/admin/services').then((r) => setServices(r.data ?? [])).catch(() => {});
  }, []);

  async function load(s = status, sv = service, q = txSearch, p = 1, uid = '') {
    setLoading(true);
    const qp = new URLSearchParams({ limit: '15', page: String(p) });
    if (s) qp.set('status', s);
    if (sv) qp.set('service', sv);
    if (q.trim()) qp.set('txId', q.trim());
    if (uid) qp.set('userId', uid);
    const r = await api(`/api/admin/transactions?${qp.toString()}`);
    setItems(r.data);
    setPages(r.pagination.pages);
    setPage(r.pagination.page);
    setLoading(false);
  }

  useEffect(() => {
    setStatus(urlStatus);
    setTxSearch(urlTxId);
    setService(urlService);
    setUserIdF(urlUserId);
    load(urlStatus, urlService, urlTxId, 1, urlUserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlStatus, urlTxId, urlService, urlUserId]);

  function changeTab(s: string) {
    setStatus(s);
    setPage(1);
    load(s, service, txSearch, 1, userIdF);
  }

  return (
    <div className="page-in">
      <AdminPageHeader title="Verifications" subtitle="Every check on the platform with customer, provider and profit." />
      <div className="mb-4"><Tabs options={TX_TABS} value={status} onChange={changeTab} /></div>
      <FilterBar>
        <select className="input !w-auto !min-h-[40px] text-sm" value={service} onChange={(e) => { setService(e.target.value); load(status, e.target.value, txSearch, 1, userIdF); }} aria-label="Filter by service">
          <option value="">All services</option>
          {services.map((s: any) => <option key={s._id} value={s.slug}>{s.name}</option>)}
        </select>
        <form
          className="relative flex-1 min-w-[200px] max-w-sm"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            load(status, service, txSearch, 1, userIdF);
          }}
        >
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
          <input className="input !pl-9 !min-h-[40px] text-sm font-mono" placeholder="Search reference ID…" value={txSearch} onChange={(e) => setTxSearch(e.target.value)} aria-label="Search by reference ID" />
        </form>
      </FilterBar>
      {loading ? <SkeletonTable /> : items.length === 0 ? (
        <EmptyState icon={<Receipt size={26} />} title="No verification records found" body="Nothing matches this filter yet." />
      ) : (
        <>
          <div className="table-wrap hidden md:block">
            <table className="data">
              <thead><tr><th>Reference</th><th>Customer</th><th>Service / provider</th><th>Status</th><th className="text-right">Amount / profit</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {items.map((t: any) => (
                  <tr key={t.txId} className="cursor-pointer" onClick={() => setSelected(t)}>
                    <td>
                      <span className="font-mono text-xs font-bold">{t.txId}</span>
                      <span className="block text-xs text-ink-500">{fmtDateTime(t.createdAt)}</span>
                    </td>
                    <td>
                      {t.user ? (
                        <>
                          <b className="text-[0.83rem]">{t.user.name}</b>
                          <span className="block text-xs text-ink-500 truncate max-w-[180px]">{t.user.email}</span>
                        </>
                      ) : <span className="text-ink-400 text-xs">—</span>}
                    </td>
                    <td><span className="text-[0.83rem]">{t.serviceSlug}</span><span className="block text-xs text-ink-500 font-mono">{t.providerCode || '—'}</span></td>
                    <td><Badge status={t.status} /></td>
                    <td className="text-right tnum font-bold">{kobo(t.amountKobo)}<span className="block text-xs font-semibold text-brand-700">+{kobo(t.profitKobo)}</span></td>
                    <td className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" icon={<Eye size={13} />} onClick={() => setSelected(t)}>View</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden space-y-2.5">
            {items.map((t: any) => (
              <button key={t.txId} onClick={() => setSelected(t)} className="card card-hover p-4 w-full text-left">
                <span className="flex justify-between gap-2 items-start">
                  <span className="font-mono text-xs font-bold break-all">{t.txId}</span>
                  <Badge status={t.status} />
                </span>
                <span className="block text-sm mt-1.5">{t.user?.name ?? '—'} · {t.serviceSlug}</span>
                <span className="flex justify-between mt-1 text-sm">
                  <span className="text-ink-500 text-xs">{fmtDateTime(t.createdAt)}</span>
                  <b className="tnum">{kobo(t.amountKobo)}</b>
                </span>
              </button>
            ))}
          </div>
          <Pagination page={page} pages={pages} onChange={(p) => load(status, service, txSearch, p, userIdF)} />
        </>
      )}
      {selected && <TxDetailModal tx={selected} onClose={() => setSelected(null)} onRefunded={() => load(status, service, txSearch, page, userIdF)} />}
    </div>
  );
}

/* ================= customers ================= */
const ROLE_OPTIONS = ['customer', 'reseller', 'api_customer', 'support', 'finance', 'manager', 'admin', 'super_admin'];

export function AdminUsers() {
  const [params] = useSearchParams();
  const urlQ = params.get('q') ?? '';
  const [items, setItems] = useState<any[]>([]);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState(urlQ);
  const [roleF, setRoleF] = useState('');
  const [statusF, setStatusF] = useState('');
  const [sort, setSort] = useState('recent');
  const [loading, setLoading] = useState(true);

  async function load(p = 1, query = q, r = roleF, s = statusF) {
    setLoading(true);
    const qp = new URLSearchParams({ page: String(p), limit: '15', stats: '1' });
    if (query.trim()) qp.set('q', query.trim());
    if (r) qp.set('role', r);
    if (s) qp.set('status', s);
    const res = await api(`/api/admin/users?${qp.toString()}`);
    setItems(res.data);
    setPages(res.pagination.pages);
    setPage(res.pagination.page);
    setTotal(res.pagination.total);
    setLoading(false);
  }

  useEffect(() => {
    setQ(urlQ);
    load(1, urlQ, '', '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQ]);

  async function setStatus(id: string, st: string, name: string) {
    const ok = st === 'suspended'
      ? await confirmDialog({ title: `Suspend ${name}?`, body: 'They will be blocked from transacting immediately.', confirmLabel: 'Suspend', danger: true })
      : true;
    if (!ok) return;
    await api(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ status: st }) });
    toast(st === 'suspended' ? 'Account suspended' : 'Account activated', st === 'suspended' ? 'error' : 'success');
    await load(page, q, roleF, statusF);
  }
  async function setRole(id: string, r: string) {
    const ok = ['admin', 'super_admin', 'manager', 'finance'].includes(r)
      ? await confirmDialog({ title: `Grant ${r} role?`, body: 'This gives the account elevated platform privileges.', confirmLabel: 'Grant role' })
      : true;
    if (!ok) return;
    await api(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ role: r }) });
    toast(`Role updated to ${r}`);
    await load(page, q, roleF, statusF);
  }

  const sorted = useMemo(() => {
    const arr = [...items];
    if (sort === 'spent') arr.sort((a, b) => (b.totalSpentKobo ?? 0) - (a.totalSpentKobo ?? 0));
    else if (sort === 'balance') arr.sort((a, b) => (b.walletBalanceKobo ?? 0) - (a.walletBalanceKobo ?? 0));
    else if (sort === 'checks') arr.sort((a, b) => (b.txCount ?? 0) - (a.txCount ?? 0));
    else if (sort === 'name') arr.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
    return arr;
  }, [items, sort]);

  return (
    <div className="page-in">
      <AdminPageHeader title="Customers" subtitle={`${total} registered accounts · balances, checks and lifetime spend included.`} />
      <FilterBar>
        <form
          className="relative flex-1 min-w-[200px] max-w-sm"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            load(1, q, roleF, statusF);
          }}
        >
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
          <input className="input !pl-9 !min-h-[40px] text-sm" placeholder="Search email, username or phone…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
        </form>
        <select className="input !w-auto !min-h-[40px] text-sm" value={roleF} onChange={(e) => { setRoleF(e.target.value); load(1, q, e.target.value, statusF); }} aria-label="Filter by role">
          <option value="">All roles</option>
          {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="input !w-auto !min-h-[40px] text-sm" value={statusF} onChange={(e) => { setStatusF(e.target.value); load(1, q, roleF, e.target.value); }} aria-label="Filter by status">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="pending">Pending</option>
        </select>
        <select className="input !w-auto !min-h-[40px] text-sm" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort customers">
          <option value="recent">Sort: Most recent</option>
          <option value="spent">Sort: Highest spend</option>
          <option value="balance">Sort: Highest balance</option>
          <option value="checks">Sort: Most checks</option>
          <option value="name">Sort: Name A–Z</option>
        </select>
      </FilterBar>
      {loading ? <SkeletonTable /> : sorted.length === 0 ? (
        <EmptyState icon={<Users size={26} />} title="No customers found" body="Try a different search or filter." />
      ) : (
        <>
          <div className="table-wrap hidden md:block">
            <table className="data">
              <thead><tr><th>Customer</th><th className="text-right">Wallet</th><th className="text-right">Checks</th><th className="text-right">Total spent</th><th>Role</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {sorted.map((u: any) => (
                  <tr key={u._id}>
                    <td>
                      <span className="flex items-center gap-2.5">
                        <Avatar name={`${u.firstName} ${u.lastName}`} size={36} />
                        <span className="min-w-0">
                          <Link to={`/admin/users/${u._id}`} className="block font-bold hover:text-brand-700 truncate">{u.firstName} {u.lastName}</Link>
                          <span className="block text-xs text-ink-500 truncate max-w-[220px]">{u.email} · {u.phone}</span>
                        </span>
                      </span>
                    </td>
                    <td className="text-right font-extrabold tnum">{kobo(u.walletBalanceKobo ?? 0)}</td>
                    <td className="text-right tnum">{u.txCount ?? 0}</td>
                    <td className="text-right tnum">{kobo(u.totalSpentKobo ?? 0)}</td>
                    <td>
                      <select value={u.role} onChange={(e) => setRole(u._id, e.target.value)} className="input !min-h-[36px] !py-1.5 !w-auto text-sm" aria-label={`Role for ${u.email}`}>
                        {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td><Badge status={u.status} /></td>
                    <td className="text-right whitespace-nowrap">
                      <Link to={`/admin/users/${u._id}`} className="btn-ghost btn-sm mr-1.5"><Eye size={13} /> Profile</Link>
                      {u.status === 'active' ? (
                        <Button variant="ghost" size="sm" icon={<Ban size={13} />} onClick={() => setStatus(u._id, 'suspended', u.email)}>Suspend</Button>
                      ) : (
                        <Button variant="ghost" size="sm" icon={<Power size={13} />} onClick={() => setStatus(u._id, 'active', u.email)}>Activate</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden space-y-2.5">
            {sorted.map((u: any) => (
              <Link key={u._id} to={`/admin/users/${u._id}`} className="card card-hover p-4 flex items-center gap-3">
                <Avatar name={`${u.firstName} ${u.lastName}`} size={42} />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-sm truncate">{u.firstName} {u.lastName}</span>
                  <span className="block text-xs text-ink-500 truncate">{u.email}</span>
                  <span className="block text-xs tnum mt-0.5">{kobo(u.walletBalanceKobo ?? 0)} · {u.txCount ?? 0} checks</span>
                </span>
                <Badge status={u.status} />
              </Link>
            ))}
          </div>
          <Pagination page={page} pages={pages} onChange={(p) => load(p, q, roleF, statusF)} />
        </>
      )}
    </div>
  );
}

/* ================= customer profile ================= */
export function AdminUserDetail() {
  const { id } = useParams();
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  const [credit, setCredit] = useState({ amount: '', reason: '' });
  const [adjusting, setAdjusting] = useState(false);

  async function load() {
    try {
      const r = await api(`/api/admin/users/${id}`);
      setD(r.data);
    } catch (e) {
      setError(e);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function adjust(kind: 'credit' | 'debit') {
    if (adjusting) return; // block duplicate taps while a request is in flight
    if (!credit.amount || !credit.reason) {
      toast('Enter an amount and a reason first', 'error');
      return;
    }
    if (!(await confirmDialog({
      title: `Manual ${kind} of ₦${credit.amount}?`,
      body: `Reason: ${credit.reason}. This writes a ledger entry and an audit record.`,
      confirmLabel: `Confirm ${kind}`, danger: kind === 'debit',
    }))) return;
    setAdjusting(true);
    try {
      await api(`/api/admin/wallet/${kind}`, { method: 'POST', body: JSON.stringify({ userId: id, amountKobo: Math.round(Number(credit.amount) * 100), reason: credit.reason }) });
      setCredit({ amount: '', reason: '' });
      toast(`Wallet ${kind}ed`);
      await load();
    } catch (e: any) {
      toast(e.body?.message || e.message || `${kind} failed`, 'error');
    } finally {
      setAdjusting(false);
    }
  }

  async function toggleSuspend() {
    if (!d) return;
    const next = d.user.status === 'active' ? 'suspended' : 'active';
    if (next === 'suspended' && !(await confirmDialog({ title: `Suspend ${d.user.email}?`, body: 'They will be blocked from transacting immediately.', confirmLabel: 'Suspend', danger: true }))) return;
    await api(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
    toast(next === 'suspended' ? 'Account suspended' : 'Account activated', next === 'suspended' ? 'error' : 'success');
    await load();
  }

  if (error) return <div className="page-in"><ErrorState message={String(error.body?.message || error.message)} onRetry={() => location.reload()} /></div>;
  if (!d) return <div className="page-in"><Skeleton className="h-8 w-64 mb-4" /><SkeletonCards n={3} /></div>;

  const u = d.user;
  const s = d.stats ?? { txTotal: 0, successful: 0, failed: 0, refunded: 0, pending: 0, totalSpentKobo: 0, totalFundedKobo: 0, fundingCount: 0, lastLoginAt: null, lastLoginIp: null };
  const successRate = s.txTotal ? Math.round((s.successful / s.txTotal) * 100) : null;

  return (
    <div className="page-in">
      <Link to="/admin/users" className="text-sm text-brand-700 font-semibold hover:underline inline-flex items-center gap-1"><ChevronLeft size={15} /> Customers</Link>
      <div className="card p-5 sm:p-6 mt-2 mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={`${u.firstName} ${u.lastName}`} size={60} />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight truncate">{u.firstName} {u.lastName}</h1>
            <p className="text-sm text-ink-500 truncate">{u.email} · {u.phone} · @{u.username}</p>
            <p className="text-xs text-ink-500 mt-0.5">Member since {fmtDate(u.createdAt)}{s.lastLoginAt ? ` · Last login ${timeAgo(s.lastLoginAt)}${s.lastLoginIp ? ` (${s.lastLoginIp})` : ''}` : ' · Never logged in yet'}</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Badge status={u.status} />
            <Badge status="active">{u.role}</Badge>
            <Badge status={u.emailVerified ? 'successful' : 'pending'}>{u.emailVerified ? 'Email verified' : 'Email unverified'}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <Button variant="ghost" size="sm" icon={u.status === 'active' ? <Ban size={14} /> : <Power size={14} />} onClick={toggleSuspend}>
            {u.status === 'active' ? 'Suspend account' : 'Activate account'}
          </Button>
          <Link to={`/admin/transactions?userId=${u._id}`} className="btn-ghost btn-sm"><Receipt size={14} /> All transactions</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <StatCard icon={<Gauge size={20} />} label="Wallet balance" value={kobo(d.wallet?.balanceKobo ?? 0)} sub={`${s.fundingCount} funding${s.fundingCount === 1 ? '' : 's'}`} tone="brand" />
        <StatCard icon={<ArrowDownLeft size={20} />} label="Total funded" value={kobo(s.totalFundedKobo)} sub="lifetime wallet funding" tone="gold" />
        <StatCard icon={<Receipt size={20} />} label="Verifications" value={String(s.txTotal)} sub={successRate == null ? 'no checks yet' : `${successRate}% successful`} tone="green" />
        <StatCard icon={<CircleDollarSign size={20} />} label="Lifetime spend" value={kobo(s.totalSpentKobo)} sub={`${s.successful} successful · ${s.failed} failed`} tone="indigo" />
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-4 items-start">
        <div className="card p-5">
          <h2 className="font-bold mb-3">Verification activity</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4 text-center">
            {[
              { l: 'Successful', v: s.successful, c: 'text-emerald-700 bg-emerald-50' },
              { l: 'Failed', v: s.failed, c: 'text-red-700 bg-red-50' },
              { l: 'Refunded', v: s.refunded, c: 'text-amber-800 bg-amber-50' },
              { l: 'Pending', v: s.pending, c: 'text-indigo-700 bg-indigo-50' },
            ].map((x) => (
              <div key={x.l} className={`rounded-xl p-3 ${x.c}`}>
                <p className="text-xl font-extrabold tnum">{x.v}</p>
                <p className="text-[0.7rem] font-bold uppercase tracking-wide opacity-80">{x.l}</p>
              </div>
            ))}
          </div>
          <h2 className="font-bold mb-2.5">Recent verifications</h2>
          {d.transactions.length === 0 ? (
            <EmptyState title="No verifications yet" body="This customer's checks will appear here." />
          ) : (
            <ul className="divide-y divide-mist-100">
              {d.transactions.map((t: any) => (
                <li key={t.txId}>
                  <Link to={`/admin/transactions?txId=${encodeURIComponent(t.txId)}`} className="flex items-center gap-3 py-2 group min-w-0">
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs font-bold truncate group-hover:text-brand-700">{t.txId}</span>
                      <span className="block text-xs text-ink-500">{t.serviceSlug} · {fmtDateTime(t.createdAt)}</span>
                    </span>
                    <b className="tnum text-sm shrink-0">{kobo(t.amountKobo)}</b>
                    <Badge status={t.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="font-bold mb-1">Wallet adjustment</h2>
            <p className="text-xs text-ink-500 mb-3">Manual movements are ledgered and audited.</p>
            <Field label="Amount (₦)" htmlFor="adj-amt"><input id="adj-amt" className="input tnum" type="number" min="1" value={credit.amount} onChange={(e) => setCredit({ ...credit, amount: e.target.value })} /></Field>
            <Field label="Reason (required)" htmlFor="adj-reason"><input id="adj-reason" className="input" value={credit.reason} onChange={(e) => setCredit({ ...credit, reason: e.target.value })} /></Field>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => adjust('credit')} loading={adjusting}>Credit</Button>
              <Button variant="ghost" size="sm" onClick={() => adjust('debit')} loading={adjusting}>Debit</Button>
            </div>
          </div>
          <div className="card p-5">
            <h2 className="font-bold mb-3">Security</h2>
            <DetailGrid
              items={[
                { label: 'Account status', value: <Badge status={u.status} /> },
                { label: '2FA', value: u.twoFactorEnabled ? <Badge status="successful">Enabled</Badge> : <span className="text-ink-500">Not enabled</span> },
                { label: 'Referral code', value: <span className="font-mono text-xs">{u.referralCode ?? '—'}</span> },
                { label: 'Failed logins', value: <span className="tnum">{u.failedLogins ?? 0}</span> },
                { label: 'Locked until', value: u.lockUntil && new Date(u.lockUntil) > new Date() ? <span className="text-red-700 font-bold">{fmtDateTime(u.lockUntil)}</span> : '—' },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= KYC requests =================
   The platform has no document-upload KYC flow: KYC here means the actual
   identity-verification requests (NIN/BVN/…) customers run. This page tracks
   those requests with customer context — nothing invented. */
export function AdminKyc() {
  const [txs, setTxs] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [perf, setPerf] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [t, s, p] = await Promise.all([
          api('/api/admin/transactions?limit=50'),
          api('/api/admin/services').catch(() => ({ data: [] })),
          api('/api/admin/services/performance').catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        setTxs(t.data ?? []);
        setServices(s.data ?? []);
        setPerf(p.data ?? []);
      } catch { /* handled below via empty states */ } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const identitySlugs = useMemo(() => new Set(services.filter((s: any) => s.category === 'identity').map((s: any) => s.slug)), [services]);
  const identityTx = txs.filter((t: any) => identitySlugs.size === 0 || identitySlugs.has(t.serviceSlug));
  const perfIdentity = perf.filter((p: any) => identitySlugs.size === 0 || identitySlugs.has(p.serviceSlug));
  const ok = perfIdentity.reduce((n, p: any) => n + p.successful, 0);
  const fail = perfIdentity.reduce((n, p: any) => n + p.failed, 0);
  const pend = perfIdentity.reduce((n, p: any) => n + p.pending, 0);

  return (
    <div className="page-in">
      <AdminPageHeader title="KYC Requests" subtitle="Identity-verification requests (NIN, BVN, …) with customer context. This platform has no document-upload flow — KYC is performed through verification checks." />
      {loading ? <SkeletonCards n={3} /> : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
            <StatCard icon={<UserCheck size={20} />} label="Identity checks" value={String(ok + fail + pend)} sub="NIN / BVN services" tone="brand" />
            <StatCard icon={<CircleCheck size={20} />} label="Verified" value={String(ok)} sub="successful identity checks" tone="green" />
            <StatCard icon={<Ban size={20} />} label="Failed" value={String(fail)} sub="no record / invalid input" tone="red" />
            <StatCard icon={<Clock size={20} />} label="Pending" value={String(pend)} sub="awaiting outcome" tone="amber" />
          </div>
          <div className="table-wrap hidden md:block">
            <table className="data">
              <thead><tr><th>Reference</th><th>Customer</th><th>KYC type</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {identityTx.map((t: any) => (
                  <tr key={t.txId}>
                    <td className="font-mono text-xs font-bold">{t.txId}</td>
                    <td>{t.user ? <><b className="text-[0.83rem]">{t.user.name}</b><span className="block text-xs text-ink-500">{t.user.email}</span></> : '—'}</td>
                    <td className="text-[0.83rem]">{t.serviceSlug}</td>
                    <td className="text-ink-500 text-[0.83rem]">{fmtDateTime(t.createdAt)}</td>
                    <td><Badge status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden space-y-2.5">
            {identityTx.map((t: any) => (
              <Link key={t.txId} to={`/admin/transactions?txId=${encodeURIComponent(t.txId)}`} className="card p-4 block">
                <span className="flex justify-between gap-2 items-start">
                  <span className="font-mono text-xs font-bold break-all">{t.txId}</span>
                  <Badge status={t.status} />
                </span>
                <span className="block text-sm mt-1">{t.user?.name ?? '—'} · {t.serviceSlug}</span>
              </Link>
            ))}
          </div>
          {identityTx.length === 0 && <EmptyState icon={<UserCheck size={26} />} title="No KYC requests yet" body="Identity verification requests will appear here." />}
        </>
      )}
    </div>
  );
}

/* ================= services ================= */
export function AdminServices() {
  const [items, setItems] = useState<any[]>([]);
  const [perf, setPerf] = useState<Record<string, any>>({});
  const [error, setError] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', category: 'identity', description: '', fieldName: 'nin', fieldLabel: 'NIN', fieldType: 'text', fieldRequired: true, fieldMin: '', fieldMax: '', fieldPattern: '', price: '250', reseller: '220', apiPrice: '200', cost: '150' });

  async function load() {
    try {
      const [s, p] = await Promise.all([
        api('/api/admin/services'),
        api('/api/admin/services/performance').catch(() => ({ data: [] })),
      ]);
      setItems(s.data);
      const m: Record<string, any> = {};
      for (const r of p.data ?? []) m[r.serviceSlug] = r;
      setPerf(m);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function toggle(s: any) {
    const next = s.status === 'active' ? 'inactive' : 'active';
    const ok = next === 'inactive'
      ? await confirmDialog({ title: `Disable ${s.name}?`, body: 'Customers and API callers will immediately stop being able to use it.', confirmLabel: 'Disable', danger: true })
      : true;
    if (!ok) return;
    await api(`/api/admin/services/${s._id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
    toast(next === 'active' ? 'Service enabled' : 'Service disabled', next === 'active' ? 'success' : 'info');
    await load();
  }

  async function reprice(s: any) {
    const v = await promptDialog({ title: `Reprice ${s.name}`, label: `Customer price in naira (current ${s.priceKobo / 100})`, initial: String(s.priceKobo / 100), inputType: 'number' });
    if (!v) return;
    await api(`/api/admin/services/${s._id}`, { method: 'PATCH', body: JSON.stringify({ priceKobo: Math.round(Number(v) * 100) }) });
    toast(`Price updated to ₦${v}`);
    await load();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/api/admin/services', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name, slug: form.slug.toLowerCase().trim(), category: form.category,
          description: form.description,
          fields: [{
            name: form.fieldName.trim() || 'id', label: form.fieldLabel.trim() || 'ID', type: form.fieldType,
            required: form.fieldRequired,
            ...(form.fieldMin ? { minLength: Math.max(0, Math.min(500, Number(form.fieldMin))) } : {}),
            ...(form.fieldMax ? { maxLength: Math.max(1, Math.min(500, Number(form.fieldMax))) } : {}),
            ...(form.fieldPattern.trim() ? { pattern: form.fieldPattern.trim() } : {}),
          }],
          priceKobo: Math.round(Number(form.price) * 100),
          resellerPriceKobo: Math.round(Number(form.reseller) * 100),
          apiPriceKobo: Math.round(Number(form.apiPrice) * 100),
          providerCostKobo: Math.round(Number(form.cost) * 100),
          status: 'active', webEnabled: true, apiEnabled: true,
        }),
      });
      setShowCreate(false);
      setForm({ name: '', slug: '', category: 'identity', description: '', fieldName: 'nin', fieldLabel: 'NIN', fieldType: 'text', fieldRequired: true, fieldMin: '', fieldMax: '', fieldPattern: '', price: '250', reseller: '220', apiPrice: '200', cost: '150' });
      toast('Service created');
      await load();
    } catch (e) {
      setError(e);
    }
  }

  return (
    <div className="page-in">
      <AdminPageHeader
        title="Services"
        subtitle="Catalogue, live performance and availability — changes apply immediately, no deploy needed."
        actions={<Button size="sm" icon={<Plus size={15} />} onClick={() => setShowCreate(!showCreate)}>{showCreate ? 'Cancel' : 'New service'}</Button>}
      />
      <InlineError error={error} />
      {showCreate && (
        <form onSubmit={create} className="card p-5 sm:p-6 mb-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4">
            <Field label="Name" htmlFor="sn"><input id="sn" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="Slug" htmlFor="ss" hint="Lowercase letters, numbers, dashes."><input id="ss" className="input font-mono text-sm" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required /></Field>
            <Field label="Category" htmlFor="sc">
              <select id="sc" className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="identity">Identity</option><option value="business">Business</option>
                <option value="education">Education</option><option value="other">Other</option>
              </select>
            </Field>
            <Field label="ID field name" htmlFor="sfn" hint="JSON key callers submit."><input id="sfn" className="input font-mono text-sm" value={form.fieldName} onChange={(e) => setForm({ ...form, fieldName: e.target.value })} required /></Field>
            <Field label="ID field label" htmlFor="sfl"><input id="sfl" className="input" value={form.fieldLabel} onChange={(e) => setForm({ ...form, fieldLabel: e.target.value })} required /></Field>
            <Field label="Field type" htmlFor="sft">
              <select id="sft" className="input" value={form.fieldType} onChange={(e) => setForm({ ...form, fieldType: e.target.value })}>
                <option value="text">Text</option><option value="number">Number</option>
                <option value="phone">Phone</option><option value="date">Date</option><option value="select">Select</option>
              </select>
            </Field>
            <Field label="Min length" htmlFor="sfmin"><input id="sfmin" type="number" min="0" max="500" className="input tnum" value={form.fieldMin} onChange={(e) => setForm({ ...form, fieldMin: e.target.value })} /></Field>
            <Field label="Max length" htmlFor="sfmax"><input id="sfmax" type="number" min="1" max="500" className="input tnum" value={form.fieldMax} onChange={(e) => setForm({ ...form, fieldMax: e.target.value })} /></Field>
            <Field label="Format pattern (regex)" htmlFor="sfp" hint="e.g. ^[0-9]{11}$ — enforces format before charging."><input id="sfp" className="input font-mono text-sm" placeholder="^[0-9]{11}$" value={form.fieldPattern} onChange={(e) => setForm({ ...form, fieldPattern: e.target.value })} /></Field>
            <Field label="Required" htmlFor="sfr">
              <label className="inline-flex items-center gap-2 pt-2 text-sm text-ink-700 cursor-pointer">
                <input id="sfr" type="checkbox" className="w-4 h-4 accent-brand-600" checked={form.fieldRequired} onChange={(e) => setForm({ ...form, fieldRequired: e.target.checked })} />
                This field must be provided
              </label>
            </Field>
            <Field label="Description" htmlFor="sd"><input id="sd" className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <Field label="Customer ₦" htmlFor="sp"><input id="sp" type="number" min="0" className="input tnum" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required /></Field>
            <Field label="Reseller ₦" htmlFor="sr"><input id="sr" type="number" min="0" className="input tnum" value={form.reseller} onChange={(e) => setForm({ ...form, reseller: e.target.value })} required /></Field>
            <Field label="API ₦" htmlFor="sa"><input id="sa" type="number" min="0" className="input tnum" value={form.apiPrice} onChange={(e) => setForm({ ...form, apiPrice: e.target.value })} required /></Field>
          </div>
          <Field label="Provider cost ₦" htmlFor="sco"><input id="sco" type="number" min="0" className="input tnum sm:!w-64" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} required /></Field>
          <Button>Create service</Button>
        </form>
      )}
      {loading ? <SkeletonCards n={6} /> : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((s: any) => {
            const st = perf[s.slug];
            return (
              <div key={s._id} className="card card-hover p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold truncate">{s.name}</h3>
                    <p className="text-xs text-ink-500 font-mono truncate">{s.slug} · {s.category}</p>
                  </div>
                  <Badge status={s.status} />
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                  <div className="rounded-xl bg-mist-50 border border-mist-200 p-2.5">
                    <p className="text-[0.66rem] font-bold uppercase tracking-wide text-ink-500">Customer</p>
                    <p className="font-extrabold tnum">{kobo(s.priceKobo)}</p>
                  </div>
                  <div className="rounded-xl bg-mist-50 border border-mist-200 p-2.5">
                    <p className="text-[0.66rem] font-bold uppercase tracking-wide text-ink-500">Cost / profit</p>
                    <p className="font-extrabold tnum text-brand-700">+{kobo(s.priceKobo - s.providerCostKobo)}</p>
                  </div>
                  <div className="rounded-xl bg-mist-50 border border-mist-200 p-2.5">
                    <p className="text-[0.66rem] font-bold uppercase tracking-wide text-ink-500">Success</p>
                    <p className="font-extrabold tnum">{st?.successRate != null ? `${st.successRate}%` : '—'}</p>
                  </div>
                </div>
                <p className="text-xs text-ink-500 mt-2.5">
                  {st ? `${st.total} checks · ${st.successful} ok · ${st.failed} failed · ${kobo(st.revenue)} revenue` : 'No checks yet.'}
                  {' '}Reseller {kobo(s.resellerPriceKobo)} · API {kobo(s.apiPriceKobo)}
                </p>
                <div className="flex gap-2 mt-3">
                  <Button variant="ghost" size="sm" onClick={() => reprice(s)}>Reprice</Button>
                  <Button variant="ghost" size="sm" icon={s.status === 'active' ? <Ban size={13} /> : <Power size={13} />} onClick={() => toggle(s)}>
                    {s.status === 'active' ? 'Disable' : 'Enable'}
                  </Button>
                  <Link to={`/admin/transactions?service=${encodeURIComponent(s.slug)}`} className="btn-ghost btn-sm">Checks</Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ================= providers ================= */
const PROVIDER_STATUS_META: Record<string, { label: string; tone: string }> = {
  online: { label: 'Connected', tone: 'green' },
  degraded: { label: 'Degraded', tone: 'amber' },
  offline: { label: 'Offline', tone: 'red' },
  maintenance: { label: 'Maintenance', tone: 'slate' },
  unknown: { label: 'Unknown', tone: 'slate' },
};

export function AdminProviders() {
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [balances, setBalances] = useState<Record<string, any>>({});
  const [balBusy, setBalBusy] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({ code: '', name: '', adapter: 'mock-generic', priority: '100', supports: 'nin-verification' });

  async function load() {
    try {
      const r = await api('/api/admin/providers');
      setItems(r.data);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function priority(p: any) {
    const v = await promptDialog({ title: `Failover priority — ${p.code}`, label: 'Lower number = tried first', initial: String(p.priority), inputType: 'number' });
    if (!v) return;
    await api(`/api/admin/providers/${p.code}`, { method: 'PATCH', body: JSON.stringify({ priority: Number(v) }) });
    toast('Priority updated');
    await load();
  }
  async function health(p: any) {
    const r = await api(`/api/admin/providers/${p.code}/health`, { method: 'POST', body: JSON.stringify({}) });
    if (r.data?.configured === false) {
      toast(`${p.code}: not configured (${(r.data.requires ?? []).slice(0, 2).join(', ')})`, 'error');
    } else {
      toast(`${p.code}: ${r.data?.online ? 'online' : 'offline'}`, r.data?.online ? 'success' : 'error');
    }
    await load();
  }
  async function liveBalance(p: any) {
    setBalBusy({ ...balBusy, [p.code]: true });
    try {
      const r = await api(`/api/admin/providers/${p.code}/balance`);
      setBalances({ ...balances, [p.code]: r.data });
      if (r.data?.supported) toast(`${p.code} float: ${kobo(r.data.balanceKobo)}`);
      else toast(`${p.code}: live balance NOT_SUPPORTED`, 'info');
    } catch (e: any) {
      toast(e.body?.message || 'Balance check failed', 'error');
    } finally {
      setBalBusy({ ...balBusy, [p.code]: false });
    }
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/api/admin/providers', {
        method: 'POST',
        body: JSON.stringify({
          code: form.code.trim(), name: form.name, adapter: form.adapter,
          priority: Number(form.priority), supports: form.supports.split(',').map((s) => s.trim()).filter(Boolean),
        }),
      });
      setShowCreate(false);
      setForm({ code: '', name: '', adapter: 'mock-generic', priority: '100', supports: 'nin-verification' });
      toast('Provider registered');
      await load();
    } catch (e) {
      setError(e);
    }
  }

  const online = items.filter((p: any) => p.status === 'online').length;
  const troubled = items.filter((p: any) => ['offline', 'degraded'].includes(p.status)).length;
  // Unconfigured vendors are inert by design — never counted as low-float.
  const lowBal = items.filter((p: any) => p.lowBalance && p.configured !== false).length;
  const unconfigured = items.filter((p: any) => p.configured === false).length;

  return (
    <div className="page-in">
      <AdminPageHeader
        title="API Providers"
        subtitle="Adapters, failover order, floats and live health — credentials stay server-side."
        actions={<Button size="sm" icon={<Plus size={15} />} onClick={() => setShowCreate(!showCreate)}>{showCreate ? 'Cancel' : 'New provider'}</Button>}
      />
      <InlineError error={error} />
      {!loading && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
          <StatCard icon={<Server size={20} />} label="Providers" value={String(items.length)} sub={`${online} connected`} tone="brand" />
          <StatCard icon={<CircleCheck size={20} />} label="Healthy" value={String(online)} sub="reporting online" tone="green" />
          <StatCard icon={<Zap size={20} />} label="Needs attention" value={String(troubled + lowBal)} sub={`${troubled} down · ${lowBal} low float${unconfigured ? ` · ${unconfigured} not configured` : ''}`} tone={troubled + lowBal > 0 ? 'red' : 'slate'} />
          <StatCard icon={<Gauge size={20} />} label="Total float" value={kobo(items.reduce((s: number, p: any) => s + (p.balanceKobo || 0), 0))} sub="tracked provider balances" tone="gold" />
        </div>
      )}
      {showCreate && (
        <form onSubmit={create} className="card p-5 sm:p-6 mb-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4">
            <Field label="Code" htmlFor="pc"><input id="pc" className="input font-mono text-sm" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required /></Field>
            <Field label="Name" htmlFor="pn"><input id="pn" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="Adapter" htmlFor="pa">
              <select id="pa" className="input font-mono text-sm" value={form.adapter} onChange={(e) => setForm({ ...form, adapter: e.target.value })}>
                <option value="mock-generic">mock-generic</option><option value="mock-nin">mock-nin</option>
                <option value="mock-bvn">mock-bvn</option><option value="mock-cac">mock-cac</option>
                <option value="mock-tin">mock-tin</option><option value="mock-jamb">mock-jamb</option>
                <option value="ninja">ninja</option><option value="dojah">dojah</option>
                <option value="prembly">prembly</option><option value="verifyme">verifyme</option>
                <option value="identifyorg">identifyorg</option>
              </select>
            </Field>
            <Field label="Priority" htmlFor="pp" hint="Lower = tried first."><input id="pp" type="number" className="input tnum" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} /></Field>
            <Field label="Supports (ops or slugs, comma-separated)" htmlFor="ps" hint="e.g. nin.lookup, bvn.lookup"><input id="ps" className="input font-mono text-sm" value={form.supports} onChange={(e) => setForm({ ...form, supports: e.target.value })} /></Field>
          </div>
          <Button>Create provider</Button>
        </form>
      )}
      {loading ? <SkeletonCards n={4} /> : (
        <div className="grid sm:grid-cols-2 gap-4">
          {items.map((p: any) => {
            const meta = PROVIDER_STATUS_META[p.status] ?? PROVIDER_STATUS_META.unknown;
            const bal = balances[p.code];
            const notConfigured = p.configured === false;
            const showLow = p.lowBalance && !notConfigured;
            return (
              <div key={p.code} className="card p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="grid place-items-center w-10 h-10 rounded-xl bg-brand-900 text-gold-300 shrink-0" aria-hidden="true"><Server size={19} /></span>
                    <div className="min-w-0">
                      <h3 className="font-bold truncate">{p.name}</h3>
                      <p className="text-xs text-ink-500 font-mono truncate">{p.code} · {p.adapter} · prio {p.priority}</p>
                    </div>
                  </div>
                  {notConfigured ? (
                    <span className="text-[0.7rem] font-extrabold uppercase tracking-wide px-2 py-1 rounded-full shrink-0 bg-mist-100 text-ink-500" title={`Missing: ${(p.requires ?? []).slice(0, 3).join(', ')}`}>
                      Not configured
                    </span>
                  ) : (
                    <span className={`text-[0.7rem] font-extrabold uppercase tracking-wide px-2 py-1 rounded-full shrink-0 ${meta.tone === 'green' ? 'bg-emerald-50 text-emerald-700' : meta.tone === 'amber' ? 'bg-amber-50 text-amber-800' : meta.tone === 'red' ? 'bg-red-50 text-red-700' : 'bg-mist-100 text-ink-600'}`}>
                      {meta.label}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                  <div className="rounded-xl bg-mist-50 border border-mist-200 p-2.5">
                    <p className="text-[0.66rem] font-bold uppercase tracking-wide text-ink-500">Success</p>
                    <p className="font-extrabold tnum">{p.successRate ?? '—'}{p.successRate != null ? '%' : ''}</p>
                    <p className="text-[0.66rem] text-ink-500">{p.successCount ?? 0} ok · {p.failCount ?? 0} fail</p>
                  </div>
                  <div className="rounded-xl bg-mist-50 border border-mist-200 p-2.5">
                    <p className="text-[0.66rem] font-bold uppercase tracking-wide text-ink-500">Avg resp</p>
                    <p className="font-extrabold tnum">{p.avgResponseMs ?? '—'}{p.avgResponseMs != null ? 'ms' : ''}</p>
                    <p className="text-[0.66rem] text-ink-500">{p.lastSuccessAt ? `ok ${timeAgo(p.lastSuccessAt)}` : 'never ok'}</p>
                  </div>
                  <div className="rounded-xl bg-mist-50 border border-mist-200 p-2.5" style={showLow ? { borderColor: '#f5c6c1', background: '#fdeceb' } : {}}>
                    <p className="text-[0.66rem] font-bold uppercase tracking-wide text-ink-500">Float</p>
                    <p className="font-extrabold tnum" style={showLow ? { color: '#b42318' } : {}}>{kobo(p.balanceKobo)}</p>
                    <p className="text-[0.66rem] text-ink-500">{notConfigured ? 'not configured' : showLow ? 'LOW BALANCE' : 'healthy'}</p>
                  </div>
                </div>
                {notConfigured && (p.requires ?? []).length > 0 && (
                  <p className="text-xs text-ink-500 bg-mist-50 border border-mist-200 rounded-lg px-2.5 py-1.5 mt-2.5 break-words">
                    Awaiting credentials: <span className="font-mono">{p.requires.slice(0, 3).join(', ')}{p.requires.length > 3 ? '…' : ''}</span> — see Provider Setup docs.
                  </p>
                )}
                {p.lastError && <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5 mt-2.5 break-words">Last error: {p.lastError}</p>}
                {p.lastFailureAt && <p className="text-xs text-ink-500 mt-1.5">Last failure {timeAgo(p.lastFailureAt)}</p>}
                {bal && (
                  <p className="text-xs mt-1.5 font-semibold text-ink-700">
                    Live balance: {bal.supported ? <b className="tnum">{kobo(bal.balanceKobo)}</b> : <span className="text-ink-500">NOT_SUPPORTED by this vendor</span>}
                  </p>
                )}
                <p className="text-xs text-ink-500 mt-2 truncate">Supports: {(p.supports || []).join(', ') || '—'}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button variant="ghost" size="sm" onClick={() => priority(p)}>Priority</Button>
                  <Button variant="ghost" size="sm" icon={<RefreshCw size={13} />} onClick={() => health(p)}>Health check</Button>
                  <Button variant="ghost" size="sm" icon={<Gauge size={13} />} onClick={() => liveBalance(p)} loading={!!balBusy[p.code]}>Live balance</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ================= API logs ================= */
function serviceFromPath(path: string): string {
  const m = String(path || '').match(/\/verify\/([a-z0-9-]+)/);
  return m ? m[1] : '—';
}

export function AdminApiLogs() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState('');
  const [serviceF, setServiceF] = useState('');
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    api('/api/admin/api-logs').then((r) => setItems(r.data ?? [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const services = useMemo(() => [...new Set(items.map((l: any) => serviceFromPath(l.path)).filter((s) => s !== '—'))], [items]);
  const filtered = items.filter((l: any) => {
    if (q.trim()) {
      const hay = `${l.keyPrefix ?? ''} ${l.path ?? ''} ${l.ip ?? ''}`.toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    if (statusF === '2xx' && !(l.status >= 200 && l.status < 300)) return false;
    if (statusF === '4xx' && !(l.status >= 400 && l.status < 500)) return false;
    if (statusF === '5xx' && !(l.status >= 500)) return false;
    if (serviceF && serviceFromPath(l.path) !== serviceF) return false;
    return true;
  });

  return (
    <div className="page-in">
      <AdminPageHeader title="API Logs" subtitle="External developer-API traffic. No secrets are ever stored in logs." />
      <FilterBar>
        <form className="relative flex-1 min-w-[200px] max-w-sm" role="search" onSubmit={(e) => e.preventDefault()}>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
          <input className="input !pl-9 !min-h-[40px] text-sm font-mono" placeholder="Search key, path or IP…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search API logs" />
        </form>
        <select className="input !w-auto !min-h-[40px] text-sm" value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="Filter by status class">
          <option value="">All statuses</option>
          <option value="2xx">2xx success</option>
          <option value="4xx">4xx client error</option>
          <option value="5xx">5xx server error</option>
        </select>
        <select className="input !w-auto !min-h-[40px] text-sm" value={serviceF} onChange={(e) => setServiceF(e.target.value)} aria-label="Filter by service">
          <option value="">All services</option>
          {services.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </FilterBar>
      {loading ? <SkeletonTable /> : filtered.length === 0 ? (
        <EmptyState icon={<ScrollText size={26} />} title="No API activity found" body="Requests made with API keys appear here." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Key</th><th>Request</th><th>Service</th><th>Status</th><th>Latency</th><th>Time</th><th className="text-right">Action</th></tr></thead>
            <tbody>
              {filtered.map((l: any) => (
                <tr key={l._id}>
                  <td className="font-mono text-xs">{l.keyPrefix}</td>
                  <td className="font-mono text-xs">{l.method} {l.path}</td>
                  <td className="font-mono text-xs">{serviceFromPath(l.path)}</td>
                  <td><Badge status={l.status < 300 ? 'successful' : l.status < 500 ? 'pending' : 'failed'}>{String(l.status)}</Badge></td>
                  <td className="tnum">{l.latencyMs}ms</td>
                  <td className="text-ink-500 text-[0.83rem] whitespace-nowrap">{fmtDateTime(l.createdAt)}</td>
                  <td className="text-right"><Button variant="ghost" size="sm" icon={<Eye size={13} />} onClick={() => setSelected(l)}>View</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="API log details">
          <div className="absolute inset-0 bg-brand-950/60 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="relative bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-5 page-in">
            <div className="flex items-start justify-between gap-2 mb-3">
              <h3 className="font-bold">Request details</h3>
              <button onClick={() => setSelected(null)} className="btn-ghost btn-sm !px-2" aria-label="Close"><X size={17} /></button>
            </div>
            <DetailGrid
              items={[
                { label: 'Key prefix', value: <span className="font-mono text-xs">{selected.keyPrefix}</span> },
                { label: 'Request', value: <span className="font-mono text-xs">{selected.method} {selected.path}</span>, span: true },
                { label: 'Status', value: <Badge status={selected.status < 300 ? 'successful' : selected.status < 500 ? 'pending' : 'failed'}>{String(selected.status)}</Badge> },
                { label: 'Latency', value: <span className="tnum">{selected.latencyMs}ms</span> },
                { label: 'IP', value: <span className="font-mono text-xs">{selected.ip ?? '—'}</span> },
                { label: 'Time', value: fmtDateTime(selected.createdAt) },
              ]}
            />
            <p className="text-xs text-ink-500 mt-3">Bodies, secrets and tokens are never written to API logs.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= finance ================= */
export function AdminFinance() {
  const [rep, setRep] = useState<any>(null);
  const [ov, setOv] = useState<any>(null);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [series, setSeries] = useState<any[]>([]);
  const [range, setRange] = useState({ from: '', to: '' });
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const p = new URLSearchParams();
    if (range.from) p.set('from', range.from);
    if (range.to) p.set('to', range.to);
    const [r, o] = await Promise.all([
      api(`/api/admin/reports/summary?${p.toString()}`),
      api('/api/admin/overview').catch(() => null),
    ]);
    setRep(r.data);
    if (o) {
      setOv(o.data);
      setSeries(o.data.revenueSeries ?? []);
    }
    const c = await api('/api/admin/commissions?limit=20').catch(() => null);
    if (c) setCommissions(c.data);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function exportCsv() {
    const p = new URLSearchParams();
    if (range.from) p.set('from', range.from);
    if (range.to) p.set('to', range.to);
    const res = await fetch(`/api/admin/reports/export?${p.toString()}`, {
      headers: { Authorization: `Bearer ${getAccess()}` },
    });
    if (!res.ok) {
      toast('Export failed', 'error');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transactions-report.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast('Report downloaded');
  }

  return (
    <div className="page-in">
      <AdminPageHeader
        title="Financial Overview"
        subtitle="Sales revenue only — wallet funding is a liability, never revenue."
        actions={<Button variant="ghost" size="sm" icon={<Download size={15} />} onClick={exportCsv}>Export CSV</Button>}
      />
      <FilterBar>
        <input type="date" className="input !w-auto !min-h-[40px] text-sm" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} aria-label="From date" />
        <span className="text-ink-500 text-sm">to</span>
        <input type="date" className="input !w-auto !min-h-[40px] text-sm" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} aria-label="To date" />
        <Button size="sm" onClick={load}>Apply</Button>
        {(range.from || range.to) && <Button size="sm" variant="ghost" onClick={() => { setRange({ from: '', to: '' }); setTimeout(load, 0); }}>Clear</Button>}
      </FilterBar>
      {loading || !rep ? <SkeletonCards n={4} /> : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
            <StatCard icon={<CircleDollarSign size={20} />} label="Revenue" value={kobo(rep.sales.revenue)} sub={`${rep.sales.count} successful checks`} tone="green" />
            <StatCard icon={<TrendingUp size={20} />} label="Gross profit" value={kobo(rep.sales.profit)} sub={`Cost ${kobo(rep.sales.providerCost)} · ${rep.sales.revenue ? Math.round((rep.sales.profit / rep.sales.revenue) * 100) : 0}% margin`} tone="gold" />
            <StatCard icon={<Landmark size={20} />} label="Wallet funding" value={kobo(rep.walletFunding.total)} sub={`${rep.walletFunding.count} top-ups · liability`} tone="brand" />
            <StatCard icon={<ArrowDownLeft size={20} />} label="Refunds" value={kobo(rep.refunds.total)} sub={`${rep.refunds.count} refunded`} tone="slate" />
          </div>
          <div className="grid lg:grid-cols-[1fr_360px] gap-4 items-start">
            <ChartCard title="Revenue — last 14 days" subtitle="Daily successful sales.">
              <AreaChart points={series.map((r: any) => ({ label: String(r._id).slice(5), value: r.revenue }))} formatY={(v) => kobo(v)} />
            </ChartCard>
            <div className="card p-5">
              <h2 className="font-bold mb-1">Wallet liability</h2>
              <p className="text-3xl font-extrabold tnum">{ov ? kobo(ov.walletLiabilityKobo) : '…'}</p>
              <p className="text-sm text-ink-500 mt-1">Total customer balances held. Backed by wallet funding, settled against provider costs on every check.</p>
            </div>
          </div>
          {commissions.length > 0 && (
            <>
              <SectionTitle title="Referral commissions" />
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>TX</th><th className="text-right">Amount</th><th>Status</th><th>Date</th></tr></thead>
                  <tbody>
                    {commissions.map((c: any) => (
                      <tr key={c._id}>
                        <td className="font-mono text-xs">{c.txId}</td>
                        <td className="text-right font-bold tnum">{kobo(c.amountKobo)}</td>
                        <td><Badge status={c.status} /></td>
                        <td className="text-ink-500 text-[0.83rem]">{fmtDateTime(c.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ================= pricing ================= */
export function AdminPricing() {
  const [items, setItems] = useState<any[]>([]);
  const [perf, setPerf] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('name');

  async function load() {
    const [s, p] = await Promise.all([
      api('/api/admin/services'),
      api('/api/admin/services/performance').catch(() => ({ data: [] })),
    ]);
    setItems(s.data ?? []);
    const m: Record<string, any> = {};
    for (const r of p.data ?? []) m[r.serviceSlug] = r;
    setPerf(m);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function editPrice(s: any, field: 'priceKobo' | 'resellerPriceKobo' | 'apiPriceKobo' | 'providerCostKobo', label: string) {
    const current = s[field] / 100;
    const v = await promptDialog({ title: `${label} — ${s.name}`, label: `Amount in naira (current ${current})`, initial: String(current), inputType: 'number' });
    if (!v && v !== '0') return;
    await api(`/api/admin/services/${s._id}`, { method: 'PATCH', body: JSON.stringify({ [field]: Math.round(Number(v) * 100) }) });
    toast(`${label} updated to ₦${v}`);
    await load();
  }

  async function toggle(s: any) {
    const next = s.status === 'active' ? 'inactive' : 'active';
    if (next === 'inactive' && !(await confirmDialog({ title: `Deactivate pricing for ${s.name}?`, body: 'The service becomes unavailable for purchase.', confirmLabel: 'Deactivate', danger: true }))) return;
    await api(`/api/admin/services/${s._id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
    toast(next === 'active' ? 'Service activated' : 'Service deactivated', next === 'active' ? 'success' : 'info');
    await load();
  }

  const rows = useMemo(() => {
    const filtered = items.filter((s: any) => !q.trim() || `${s.name} ${s.slug}`.toLowerCase().includes(q.trim().toLowerCase()));
    const withMargin = filtered.map((s: any) => {
      const profit = s.priceKobo - s.providerCostKobo;
      return { ...s, profit, marginPct: s.priceKobo > 0 ? Math.round((profit / s.priceKobo) * 1000) / 10 : 0 };
    });
    if (sort === 'price') withMargin.sort((a, b) => b.priceKobo - a.priceKobo);
    else if (sort === 'profit') withMargin.sort((a, b) => b.profit - a.profit);
    else if (sort === 'margin') withMargin.sort((a, b) => b.marginPct - a.marginPct);
    else withMargin.sort((a, b) => a.name.localeCompare(b.name));
    return withMargin;
  }, [items, q, sort]);

  return (
    <div className="page-in">
      <AdminPageHeader title="Pricing" subtitle="Every tier, cost and margin. Edits apply immediately via the existing pricing engine." />
      <FilterBar>
        <form className="relative flex-1 min-w-[200px] max-w-sm" role="search" onSubmit={(e) => e.preventDefault()}>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
          <input className="input !pl-9 !min-h-[40px] text-sm" placeholder="Search services…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search services" />
        </form>
        <select className="input !w-auto !min-h-[40px] text-sm" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort pricing">
          <option value="name">Sort: Name</option>
          <option value="price">Sort: Highest price</option>
          <option value="profit">Sort: Highest profit</option>
          <option value="margin">Sort: Highest margin %</option>
        </select>
      </FilterBar>
      {loading ? <SkeletonTable /> : rows.length === 0 ? (
        <EmptyState icon={<FileText size={26} />} title="No services found" body="Try a different search." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Service</th><th className="text-right">Provider cost</th><th className="text-right">Customer</th><th className="text-right">Reseller / API</th><th className="text-right">Profit / margin</th><th className="text-right">Checks</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {rows.map((s: any) => {
                const st = perf[s.slug];
                return (
                  <tr key={s._id}>
                    <td><b>{s.name}</b><span className="block text-xs text-ink-500 font-mono">{s.slug}</span></td>
                    <td className="text-right tnum">
                      <button className="hover:text-brand-700 hover:underline font-semibold" onClick={() => editPrice(s, 'providerCostKobo', 'Provider cost')} title="Edit provider cost">{kobo(s.providerCostKobo)}</button>
                    </td>
                    <td className="text-right tnum">
                      <button className="hover:text-brand-700 hover:underline font-extrabold" onClick={() => editPrice(s, 'priceKobo', 'Customer price')} title="Edit customer price">{kobo(s.priceKobo)}</button>
                    </td>
                    <td className="text-right tnum text-[0.83rem]">
                      <button className="hover:text-brand-700 hover:underline" onClick={() => editPrice(s, 'resellerPriceKobo', 'Reseller price')} title="Edit reseller price">{kobo(s.resellerPriceKobo)}</button>
                      {' / '}
                      <button className="hover:text-brand-700 hover:underline" onClick={() => editPrice(s, 'apiPriceKobo', 'API price')} title="Edit API price">{kobo(s.apiPriceKobo)}</button>
                    </td>
                    <td className="text-right tnum"><b className="text-brand-700">+{kobo(s.profit)}</b><span className="block text-xs text-ink-500">{s.marginPct}% margin</span></td>
                    <td className="text-right tnum">{st ? `${st.total} (${st.successRate ?? '—'}${st.successRate != null ? '%' : ''})` : '—'}</td>
                    <td><Badge status={s.status} /></td>
                    <td className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" icon={s.status === 'active' ? <Ban size={13} /> : <Power size={13} />} onClick={() => toggle(s)}>
                        {s.status === 'active' ? 'Deactivate' : 'Activate'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-ink-500 mt-3">Click any price to edit it. Profit = customer price − provider cost. All changes are audited.</p>
    </div>
  );
}

/* ================= reports (legacy detailed view, preserved) ================= */
export function AdminReports() {
  const [d, setD] = useState<any>(null);
  const [range, setRange] = useState({ from: '', to: '' });
  const [loading, setLoading] = useState(true);
  const [commissions, setCommissions] = useState<any[]>([]);

  async function load() {
    setLoading(true);
    const p = new URLSearchParams();
    if (range.from) p.set('from', range.from);
    if (range.to) p.set('to', range.to);
    const r = await api(`/api/admin/reports/summary?${p.toString()}`);
    setD(r.data);
    const c = await api('/api/admin/commissions?limit=20').catch(() => null);
    if (c) setCommissions(c.data);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function exportCsv() {
    const p = new URLSearchParams();
    if (range.from) p.set('from', range.from);
    if (range.to) p.set('to', range.to);
    const res = await fetch(`/api/admin/reports/export?${p.toString()}`, {
      headers: { Authorization: `Bearer ${getAccess()}` },
    });
    if (!res.ok) {
      toast('Export failed', 'error');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transactions-report.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast('Report downloaded');
  }

  return (
    <div className="page-in">
      <AdminPageHeader
        title="Reports"
        subtitle="Detailed sales / funding / refund breakdown with CSV export. See Financial Overview for charts."
        actions={<Button variant="ghost" size="sm" icon={<Download size={15} />} onClick={exportCsv}>Export CSV</Button>}
      />
      <FilterBar>
        <input type="date" className="input !w-auto !min-h-[40px] text-sm" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} aria-label="From date" />
        <span className="text-ink-500 text-sm">to</span>
        <input type="date" className="input !w-auto !min-h-[40px] text-sm" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} aria-label="To date" />
        <Button size="sm" onClick={load}>Apply</Button>
      </FilterBar>
      {loading || !d ? <SkeletonCards n={3} /> : (
        <>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="card p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-500">Sales revenue</p>
              <p className="text-2xl font-extrabold tnum mt-1">{kobo(d.sales.revenue)}</p>
              <p className="text-sm text-ink-500">{d.sales.count} checks · cost {kobo(d.sales.providerCost)} · <b className="text-brand-700">profit {kobo(d.sales.profit)}</b></p>
            </div>
            <div className="card p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-500">Wallet funding (liability)</p>
              <p className="text-2xl font-extrabold tnum mt-1">{kobo(d.walletFunding.total)}</p>
              <p className="text-sm text-ink-500">{d.walletFunding.count} top-ups · not revenue</p>
            </div>
            <div className="card p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-500">Refunds</p>
              <p className="text-2xl font-extrabold tnum mt-1">{kobo(d.refunds.total)}</p>
              <p className="text-sm text-ink-500">{d.refunds.count} refunded transactions</p>
            </div>
          </div>
          {commissions.length > 0 && (
            <>
              <SectionTitle title="Referral commissions" />
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>TX</th><th className="text-right">Amount</th><th>Status</th><th>Date</th></tr></thead>
                  <tbody>
                    {commissions.map((c: any) => (
                      <tr key={c._id}>
                        <td className="font-mono text-xs">{c.txId}</td>
                        <td className="text-right font-bold tnum">{kobo(c.amountKobo)}</td>
                        <td><Badge status={c.status} /></td>
                        <td className="text-ink-500 text-[0.83rem]">{fmtDateTime(c.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ================= team ================= */
const STAFF_ROLES = ['support', 'finance', 'manager', 'admin', 'super_admin'];

export function AdminTeam() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  async function load() {
    setLoading(true);
    const perRole = await Promise.all(
      STAFF_ROLES.map((r) => api(`/api/admin/users?role=${r}&limit=100`).catch(() => ({ data: [] })))
    );
    const merged = perRole.flatMap((r: any) => r.data ?? []);
    merged.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setItems(merged);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function setRole(id: string, r: string, name: string) {
    if (['admin', 'super_admin'].includes(r) && !(await confirmDialog({ title: `Grant ${r} to ${name}?`, body: 'This gives full platform control including providers and settings.', confirmLabel: 'Grant', danger: true }))) return;
    await api(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ role: r }) });
    toast(`Role updated to ${r}`);
    await load();
  }
  async function setStatus(id: string, st: string, name: string) {
    if (st === 'suspended' && !(await confirmDialog({ title: `Suspend ${name}?`, body: 'They lose console access immediately.', confirmLabel: 'Suspend', danger: true }))) return;
    await api(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ status: st }) });
    toast(st === 'suspended' ? 'Member suspended' : 'Member activated', st === 'suspended' ? 'error' : 'success');
    await load();
  }

  const filtered = items.filter((u: any) => !q.trim() || `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(q.trim().toLowerCase()));
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const u of items) m[u.role] = (m[u.role] ?? 0) + 1;
    return m;
  }, [items]);

  return (
    <div className="page-in">
      <AdminPageHeader title="Team Members" subtitle="Staff accounts with console access. Roles follow the platform permission matrix." />
      {!loading && (
        <div className="flex flex-wrap gap-2 mb-4">
          {STAFF_ROLES.map((r) => (
            <span key={r} className="inline-flex items-center gap-1.5 text-xs font-bold bg-white border border-mist-200 rounded-full px-3 py-1.5">
              <span className="capitalize">{r.replace('_', ' ')}</span>
              <b className="tnum">{counts[r] ?? 0}</b>
            </span>
          ))}
        </div>
      )}
      <FilterBar>
        <form className="relative flex-1 min-w-[200px] max-w-sm" role="search" onSubmit={(e) => e.preventDefault()}>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
          <input className="input !pl-9 !min-h-[40px] text-sm" placeholder="Search team…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search team members" />
        </form>
        <Link to="/admin/roles" className="btn-ghost btn-sm"><KeyRound size={14} /> Permission matrix</Link>
      </FilterBar>
      {loading ? <SkeletonTable /> : filtered.length === 0 ? (
        <EmptyState icon={<UserRound size={26} />} title="No team members found" body="Staff accounts appear here once created." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Joined</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {filtered.map((u: any) => (
                <tr key={u._id}>
                  <td>
                    <span className="flex items-center gap-2.5">
                      <Avatar name={`${u.firstName} ${u.lastName}`} size={36} />
                      <span>
                        <span className="block font-bold">{u.firstName} {u.lastName}</span>
                        <span className="block text-xs text-ink-500">{u.email}</span>
                      </span>
                    </span>
                  </td>
                  <td>
                    <select value={u.role} onChange={(e) => setRole(u._id, e.target.value, u.email)} className="input !min-h-[36px] !py-1.5 !w-auto text-sm" aria-label={`Role for ${u.email}`}>
                      {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td><Badge status={u.status} /></td>
                  <td className="text-ink-500 text-[0.83rem]">{fmtDate(u.createdAt)}</td>
                  <td className="text-right whitespace-nowrap">
                    <Link to={`/admin/users/${u._id}`} className="btn-ghost btn-sm mr-1.5"><Eye size={13} /> View</Link>
                    {u.status === 'active' ? (
                      <Button variant="ghost" size="sm" icon={<Ban size={13} />} onClick={() => setStatus(u._id, 'suspended', u.email)}>Suspend</Button>
                    ) : (
                      <Button variant="ghost" size="sm" icon={<Power size={13} />} onClick={() => setStatus(u._id, 'active', u.email)}>Activate</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ================= roles ================= */
export function AdminRoles() {
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  useEffect(() => {
    api('/api/admin/roles').then((r) => setD(r.data)).catch(setError);
  }, []);
  if (error) return <div className="page-in"><AdminPageHeader title="Roles & Permissions" /><ErrorState message={String(error.body?.message || error.message)} onRetry={() => location.reload()} /></div>;
  if (!d) return <div className="page-in"><Skeleton className="h-8 w-56 mb-4" /><SkeletonTable /></div>;
  const perms: string[] = [...new Set((Object.values(d.permissions) as string[][]).flat())];
  return (
    <div className="page-in">
      <AdminPageHeader title="Roles & Permissions" subtitle="The live platform permission matrix. Assign roles on the Team page." actions={<Link to="/admin/team" className="btn-ghost btn-sm"><UserRound size={14} /> Team members</Link>} />
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Permission</th>{d.roles.map((r: string) => <th key={r} className="text-center capitalize">{r.replace('_', ' ')}</th>)}</tr></thead>
          <tbody>
            {perms.map((p) => (
              <tr key={p}>
                <td className="font-mono text-xs">{p}</td>
                {d.roles.map((r: string) => (
                  <td key={r} className="text-center">
                    {(d.permissions[r] ?? []).includes(p)
                      ? <CircleCheck size={17} className="inline text-emerald-600" aria-label="Allowed" />
                      : <span className="text-ink-300" aria-label="Denied">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-500 mt-3">Super admins and admins hold every permission. Customers, resellers and API customers hold none of these console permissions.</p>
    </div>
  );
}

/* ================= audit ================= */
export function AdminAudit() {
  const [items, setItems] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  async function load(p = 1) {
    setLoading(true);
    const r = await api(`/api/admin/audit?page=${p}&limit=25`);
    setItems(r.data);
    setPages(r.pagination.pages);
    setPage(r.pagination.page);
    setLoading(false);
  }
  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = items.filter((a: any) => {
    if (!q.trim()) return true;
    const hay = `${a.actorEmail ?? ''} ${a.action} ${a.entity ?? ''} ${a.entityId ?? ''}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  return (
    <div className="page-in">
      <AdminPageHeader title="Audit Logs" subtitle="Who changed what, and when. Immutable security trail." />
      <FilterBar>
        <form className="relative flex-1 min-w-[200px] max-w-sm" role="search" onSubmit={(e) => e.preventDefault()}>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
          <input className="input !pl-9 !min-h-[40px] text-sm font-mono" placeholder="Search actor, action, entity…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search audit logs" />
        </form>
      </FilterBar>
      {loading ? <SkeletonTable /> : filtered.length === 0 ? (
        <EmptyState icon={<ShieldCheck size={26} />} title="No audit entries found" body="Admin and security actions are recorded here." />
      ) : (
        <>
          <div className="table-wrap hidden md:block">
            <table className="data">
              <thead><tr><th>Actor</th><th>Action</th><th>Entity</th><th>IP</th><th>Time</th></tr></thead>
              <tbody>
                {filtered.map((a: any) => (
                  <tr key={a._id}>
                    <td className="font-semibold">{a.actorEmail || '—'}</td>
                    <td><code className="font-mono text-xs bg-mist-50 border border-mist-200 rounded px-1.5 py-0.5">{a.action}</code></td>
                    <td className="text-ink-500 text-[0.83rem]">{a.entity ? `${a.entity}:${a.entityId}` : '—'}</td>
                    <td className="font-mono text-xs text-ink-500">{a.ip ?? '—'}</td>
                    <td className="text-ink-500 text-[0.83rem] whitespace-nowrap">{fmtDateTime(a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden space-y-2.5">
            {filtered.map((a: any) => (
              <div key={a._id} className="card p-4 text-sm">
                <p className="font-bold truncate">{a.actorEmail || '—'}</p>
                <p className="mt-1"><code className="font-mono text-xs bg-mist-50 border border-mist-200 rounded px-1.5 py-0.5">{a.action}</code></p>
                <p className="text-xs text-ink-500 mt-1">{a.entity ? `${a.entity}:${a.entityId} · ` : ''}{fmtDateTime(a.createdAt)}</p>
              </div>
            ))}
          </div>
          <Pagination page={page} pages={pages} onChange={(p) => load(p)} />
        </>
      )}
    </div>
  );
}

/* ================= notifications ================= */
export function AdminNotifications() {
  const [mine, setMine] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [n, prov, ov] = await Promise.all([
      api('/api/notifications').catch(() => null),
      api('/api/admin/providers').catch(() => null),
      api('/api/admin/overview').catch(() => null),
    ]);
    if (n) {
      setMine(n.data ?? []);
      setUnread(n.unread ?? 0);
    }
    const list: any[] = [];
    for (const p of prov?.data ?? []) {
      if (p.lowBalance && p.configured !== false) {
        list.push({ kind: 'error', title: `Low provider float — ${p.name}`, body: `${kobo(p.balanceKobo)} remaining (threshold ${kobo(p.lowBalanceKobo)}). Top up to avoid failed verifications.`, link: '/admin/providers' });
      }
      if (['offline', 'degraded'].includes(p.status)) {
        list.push({ kind: 'error', title: `Provider ${p.status} — ${p.name}`, body: p.lastError ? `Last error: ${p.lastError}` : 'Failover is routing around this provider.', link: '/admin/providers' });
      }
    }
    const t = ov?.data?.transactions;
    if (t && t.pending > 0) {
      list.push({ kind: 'warn', title: `${t.pending} verifications pending`, body: 'Created / pending / processing transactions awaiting outcome or reconciliation.', link: '/admin/transactions?status=processing' });
    }
    setAlerts(list);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function markRead(id: string) {
    await api(`/api/notifications/${id}/read`, { method: 'POST', body: JSON.stringify({}) });
    notifyNotificationsChanged();
    await load();
  }
  async function markAll() {
    await api('/api/notifications/read-all', { method: 'POST', body: JSON.stringify({}) });
    toast('All notifications marked as read');
    notifyNotificationsChanged();
    await load();
  }

  return (
    <div className="page-in">
      <AdminPageHeader
        title="Notifications"
        subtitle="Live system alerts derived from provider and transaction state, plus your personal inbox."
        actions={unread > 0 ? <Button variant="ghost" size="sm" onClick={markAll}>Mark all read</Button> : undefined}
      />
      {loading ? <SkeletonCards n={3} /> : (
        <>
          <SectionTitle title={`System alerts (${alerts.length})`} />
          {alerts.length === 0 ? (
            <div className="card p-5 flex items-center gap-3 text-sm">
              <CircleCheck size={20} className="text-emerald-600 shrink-0" />
              <p><b>All clear.</b> <span className="text-ink-500">No low floats, no degraded providers, no pending backlog.</span></p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {alerts.map((a, i) => (
                <Link key={i} to={a.link} className="card card-hover p-4 flex items-start gap-3">
                  <span className={`grid place-items-center w-9 h-9 rounded-xl shrink-0 ${a.kind === 'error' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`} aria-hidden="true">
                    <Zap size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-bold text-sm">{a.title}</span>
                    <span className="block text-sm text-ink-500">{a.body}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
          <SectionTitle title={`Your inbox (${unread} unread)`} />
          {mine.length === 0 ? (
            <EmptyState icon={<Bell size={26} />} title="No notifications" body="Security and platform notices for your account appear here." />
          ) : (
            <div className="space-y-2.5">
              {mine.map((m: any) => (
                <div key={m._id} className={`card p-4 flex items-start gap-3 ${m.read ? '' : 'border-brand-200'}`}>
                  {!m.read && <span className="w-2 h-2 rounded-full bg-brand-600 mt-1.5 shrink-0" aria-label="Unread" />}
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-sm">{m.title}</span>
                    <span className="block text-sm text-ink-500">{m.body}</span>
                    <span className="block text-xs text-ink-400 mt-1">{fmtDateTime(m.createdAt)}</span>
                  </span>
                  {!m.read && <Button variant="ghost" size="sm" onClick={() => markRead(m._id)}>Mark read</Button>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ================= support ================= */
export function AdminSupport() {
  const [items, setItems] = useState<any[]>([]);
  const [reply, setReply] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statusF, setStatusF] = useState('');

  async function load() {
    try {
      const r = await api('/api/admin/support');
      setItems(r.data);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function send(ticketNo: string, resolve: boolean) {
    if (sending[ticketNo]) return; // block duplicate taps while a request is in flight
    const message = reply[ticketNo] || '';
    if (!message.trim()) {
      toast('Write a reply first', 'error');
      return;
    }
    setSending({ ...sending, [ticketNo]: true });
    try {
      await api(`/api/admin/support/${ticketNo}/reply`, { method: 'POST', body: JSON.stringify({ message, resolve }) });
      setReply({ ...reply, [ticketNo]: '' });
      toast(resolve ? 'Ticket resolved' : 'Reply sent');
      await load();
    } catch (e: any) {
      toast(e.body?.message || e.message || 'Reply failed', 'error');
    } finally {
      setSending({ ...sending, [ticketNo]: false });
    }
  }

  const open = items.filter((t: any) => ['open', 'pending'].includes(t.status)).length;
  const filtered = statusF ? items.filter((t: any) => t.status === statusF) : items;

  return (
    <div className="page-in">
      <AdminPageHeader title="Support Tickets" subtitle={`${open} open · customer conversations with transaction context.`} />
      <InlineError error={error} />
      <FilterBar>
        <select className="input !w-auto !min-h-[40px] text-sm" value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="Filter by ticket status">
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="pending">Pending</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      </FilterBar>
      {loading ? <SkeletonTable rows={3} /> : filtered.length === 0 ? (
        <EmptyState icon={<LifeBuoy size={26} />} title="No tickets" body="All quiet — new customer requests appear here." />
      ) : filtered.map((t: any) => (
        <div key={t.ticketNo} className="card p-4 sm:p-5 mb-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <b className="font-mono">{t.ticketNo}</b>
            <Badge status={t.status} />
            <span className="text-ink-500">priority {t.priority}</span>
            {t.txId && <Link to={`/admin/transactions?txId=${encodeURIComponent(t.txId)}`} className="font-mono text-xs bg-mist-50 border border-mist-200 rounded px-1.5 py-0.5 hover:border-brand-300 hover:text-brand-700">tx {t.txId}</Link>}
            <span className="ml-auto text-xs text-ink-400">{timeAgo(t.updatedAt)}</span>
          </div>
          <p className="font-bold mt-1.5">{t.subject}</p>
          <div className="mt-2 space-y-1.5 border-l-2 border-mist-200 pl-3">
            {t.messages.map((m: any, i: number) => (
              <p key={i} className="text-ink-700"><b className={m.from.startsWith('staff:') ? 'text-brand-700' : ''}>{m.from}:</b> {m.body}</p>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 mt-3">
            <input className="input flex-1" placeholder="Write a staff reply…" value={reply[t.ticketNo] || ''} onChange={(e) => setReply({ ...reply, [t.ticketNo]: e.target.value })} aria-label={`Reply to ${t.ticketNo}`} />
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" icon={<Send size={13} />} onClick={() => send(t.ticketNo, false)} loading={!!sending[t.ticketNo]}>Reply</Button>
              <Button size="sm" onClick={() => send(t.ticketNo, true)} loading={!!sending[t.ticketNo]}>Resolve</Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ================= settings ================= */
export function AdminSettings() {
  const [pct, setPct] = useState('5');
  const [minW, setMinW] = useState('1000');
  const [raw, setRaw] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('/api/admin/settings')
      .then((r) => {
        setRaw(r.data);
        const ref = r.data.find((s: any) => s.key === 'referral');
        if (ref?.value?.percent != null) setPct(String(ref.value.percent));
        if (ref?.value?.minWithdrawalKobo != null) setMinW(String(ref.value.minWithdrawalKobo / 100));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (saving) return; // block duplicate taps while a request is in flight
    setSaving(true);
    try {
      await api('/api/admin/settings/referral', { method: 'PUT', body: JSON.stringify({ value: { percent: Number(pct), minWithdrawalKobo: Math.round(Number(minW) * 100) } }) });
      toast('Referral settings saved');
      const r = await api('/api/admin/settings');
      setRaw(r.data);
    } catch (e: any) {
      toast(e.body?.message || e.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-in mx-auto max-w-3xl">
      <AdminPageHeader title="Settings" subtitle="Platform configuration. Every change is audited." />
      {loading ? <Skeleton className="h-64" /> : (
        <>
          <div className="card p-5 sm:p-6 mb-4">
            <h2 className="font-bold mb-1">Referral program</h2>
            <p className="text-sm text-ink-500 mb-4">Commission paid from profit on every successful referred check.</p>
            <div className="grid sm:grid-cols-2 gap-x-4">
              <Field label="Commission (% of profit)" htmlFor="pct" hint="0–50%.">
                <input id="pct" type="number" min="0" max="50" className="input tnum" value={pct} onChange={(e) => setPct(e.target.value)} />
              </Field>
              <Field label="Minimum withdrawal (₦)" htmlFor="minw" hint="Payout threshold.">
                <input id="minw" type="number" min="0" className="input tnum" value={minW} onChange={(e) => setMinW(e.target.value)} />
              </Field>
            </div>
            <Button onClick={save} loading={saving}>Save settings</Button>
          </div>
          <div className="card p-5 sm:p-6 mb-4">
            <h2 className="font-bold mb-1">Security posture</h2>
            <ul className="text-sm text-ink-600 space-y-1.5 mt-2">
              <li className="flex gap-2"><Lock size={15} className="text-brand-700 shrink-0 mt-0.5" /> JWT sessions with 5-strike lockout and optional TOTP 2FA per account.</li>
              <li className="flex gap-2"><KeyRound size={15} className="text-brand-700 shrink-0 mt-0.5" /> Developer API keys are hashed, revocable and rotatable with IP allowlists.</li>
              <li className="flex gap-2"><ShieldCheck size={15} className="text-brand-700 shrink-0 mt-0.5" /> Provider secrets live server-side only — never in the browser or logs.</li>
            </ul>
          </div>
          <h2 className="font-bold mb-2">Stored configuration</h2>
          <pre className="card p-4 text-xs overflow-x-auto font-mono">{JSON.stringify(raw, null, 2)}</pre>
        </>
      )}
    </div>
  );
}
