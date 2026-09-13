import { ReactNode, useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Grid2x2, Wallet, History, KeyRound, Gift, Bell, LifeBuoy, UserRound,
  BarChart3, Users, Layers, Server, Receipt, FileBarChart, ScrollText, Settings, LogOut,
  Menu, Search, X, ShieldCheck, CircleHelp,
} from 'lucide-react';
import { clearTokens, api } from '../lib/api';
import { Logo, Avatar, ToastHost, DialogHost, toast } from './kit';

export function useUser() {
  const [user, setUser] = useState<any>(() => {
    try {
      return JSON.parse(localStorage.getItem('nv_user') || 'null');
    } catch {
      return null;
    }
  });
  return [user, setUser] as const;
}

export function saveUser(u: any) {
  localStorage.setItem('nv_user', JSON.stringify(u));
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-2 focus:bg-white focus:z-50">
        Skip to content
      </a>
      <main id="main">{children}</main>
      <ToastHost />
      <DialogHost />
    </div>
  );
}

interface NavItem { label: string; href: string; icon: ReactNode; end?: boolean }

const CUSTOMER_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/app', icon: <LayoutDashboard size={19} />, end: true },
  { label: 'Services', href: '/app/services', icon: <Grid2x2 size={19} /> },
  { label: 'Wallet', href: '/app/wallet', icon: <Wallet size={19} /> },
  { label: 'Transactions', href: '/app/transactions', icon: <History size={19} /> },
  { label: 'Bulk', href: '/app/bulk', icon: <Layers size={19} /> },
  { label: 'API', href: '/app/api', icon: <KeyRound size={19} /> },
  { label: 'Referrals', href: '/app/referrals', icon: <Gift size={19} /> },
  { label: 'Notifications', href: '/app/notifications', icon: <Bell size={19} /> },
  { label: 'Support', href: '/app/support', icon: <LifeBuoy size={19} /> },
  { label: 'Profile', href: '/app/profile', icon: <UserRound size={19} /> },
];

const ADMIN_NAV: NavItem[] = [
  { label: 'Overview', href: '/admin', icon: <BarChart3 size={19} />, end: true },
  { label: 'Users', href: '/admin/users', icon: <Users size={19} /> },
  { label: 'Services', href: '/admin/services', icon: <Grid2x2 size={19} /> },
  { label: 'Providers', href: '/admin/providers', icon: <Server size={19} /> },
  { label: 'Transactions', href: '/admin/transactions', icon: <Receipt size={19} /> },
  { label: 'Reports', href: '/admin/reports', icon: <FileBarChart size={19} /> },
  { label: 'Support', href: '/admin/support', icon: <LifeBuoy size={19} /> },
  { label: 'API Logs', href: '/admin/api-logs', icon: <ScrollText size={19} /> },
  { label: 'Audit Logs', href: '/admin/audit', icon: <ShieldCheck size={19} /> },
  { label: 'Settings', href: '/admin/settings', icon: <Settings size={19} /> },
];

const MOBILE_NAV: NavItem[] = [
  { label: 'Home', href: '/app', icon: <LayoutDashboard size={21} />, end: true },
  { label: 'Services', href: '/app/services', icon: <Grid2x2 size={21} /> },
  { label: 'Wallet', href: '/app/wallet', icon: <Wallet size={21} /> },
  { label: 'Activity', href: '/app/transactions', icon: <History size={21} /> },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [user] = useUser();
  const nav = useNavigate();
  const loc = useLocation();
  const [drawer, setDrawer] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [unread, setUnread] = useState(0);
  const isAdmin = user && ['admin', 'super_admin', 'manager', 'finance', 'support'].includes(user.role);
  const adminSection = loc.pathname.startsWith('/admin');

  useEffect(() => {
    setDrawer(false);
    setMenuOpen(false);
  }, [loc.pathname]);

  useEffect(() => {
    api('/api/notifications')
      .then((r) => setUnread(r.unread || 0))
      .catch(() => {});
    const t = setInterval(() => {
      api('/api/notifications').then((r) => setUnread(r.unread || 0)).catch(() => {});
    }, 60000);
    return () => clearInterval(t);
  }, []);

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    } catch {
      /* ignore */
    }
    clearTokens();
    localStorage.removeItem('nv_user');
    toast('Logged out', 'info');
    nav('/login');
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    nav(`/app/services${query ? `?q=${encodeURIComponent(query)}` : ''}`);
    setQuery('');
  }

  const firstName = user?.firstName || user?.username || 'there';

  return (
    <div className="min-h-screen lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-2 focus:bg-white focus:z-[110]">
        Skip to content
      </a>

      {/* Mobile drawer backdrop */}
      {drawer && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-40 lg:hidden" onClick={() => setDrawer(false)} aria-hidden="true" />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 z-50 h-screen w-[276px] shrink-0 flex flex-col px-4 py-5 transition-transform duration-200 lg:translate-x-0 ${
          drawer ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ background: 'linear-gradient(180deg, #0a3f2a 0%, #06291c 55%, #031810 100%)' }}
        aria-label="Primary navigation"
      >
        <div className="flex items-center justify-between px-1">
          <Link to="/" className="rounded-lg" aria-label="NaijaVerify home">
            <span className="inline-flex items-center gap-2.5">
              <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0 drop-shadow-sm">
                <rect width="32" height="32" rx="9" fill="#ffffff" />
                <path d="M9 22V10l7 8 7-8v12" stroke="#12b76a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                <circle cx="23.5" cy="22.5" r="2.4" fill="#c9a227" />
              </svg>
              <span className="text-[1.15rem] font-extrabold tracking-tight text-white">
                Naija<span className="text-brand-300">Verify</span>
              </span>
            </span>
          </Link>
          <button className="lg:hidden text-white/70 hover:text-white p-2" onClick={() => setDrawer(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <nav className="mt-6 flex-1 overflow-y-auto flex flex-col gap-0.5" aria-label="Workspace">
          {!adminSection &&
            CUSTOMER_NAV.map((n) => (
              <NavLink key={n.href} to={n.href} end={n.end} className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`}>
                {n.icon}
                {n.label}
                {n.label === 'Notifications' && unread > 0 && (
                  <span className="ml-auto text-[0.7rem] font-bold bg-gold-400 text-brand-950 rounded-full min-w-[20px] h-5 grid place-items-center px-1">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </NavLink>
            ))}
          {isAdmin && (
            <>
              <p className="text-[0.68rem] uppercase tracking-[0.12em] text-white/40 mt-5 mb-1.5 px-3 font-bold">Administration</p>
              {ADMIN_NAV.map((n) => (
                <NavLink key={n.href} to={n.href} end={n.end} className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`}>
                  {n.icon}
                  {n.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="pt-3 border-t border-white/10">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <Avatar name={`${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email} size={36} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-white/50 truncate capitalize">{user?.role?.replace(/_/g, ' ')}</p>
            </div>
            <button onClick={logout} className="text-white/60 hover:text-white p-2 rounded-lg hover:bg-white/10" aria-label="Logout" title="Logout">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Topbar */}
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-mist-200/80">
          <div className="mx-auto max-w-6xl px-4 h-[64px] flex items-center gap-3">
            <button className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-mist-100 transition-colors" onClick={() => setDrawer(true)} aria-label="Open menu">
              <Menu size={21} />
            </button>
            <div className="hidden sm:block min-w-0">
              <p className="text-[0.8rem] text-ink-500 leading-4">{greeting()},</p>
              <p className="font-bold leading-5 truncate text-ink-900">{firstName}</p>
            </div>
            <form onSubmit={submitSearch} className="hidden md:flex flex-1 max-w-md ml-4 relative" role="search">
              <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" aria-hidden="true" />
              <input
                className="input !rounded-full !pl-10 !bg-mist-25 border-transparent hover:border-mist-200"
                placeholder="Search verification services…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search verification services"
              />
            </form>
            <div className="ml-auto flex items-center gap-1.5">
              <Link
                to="/app/notifications"
                className="relative p-2.5 rounded-xl hover:bg-mist-100 text-ink-700 transition-colors"
                aria-label={unread > 0 ? `${unread} unread notifications` : 'Notifications'}
              >
                <Bell size={20} />
                {unread > 0 && (
                  <span className="absolute top-1 right-1 text-[0.65rem] font-bold bg-red-600 text-white rounded-full min-w-[18px] h-[18px] grid place-items-center px-1 shadow-sm">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </Link>
              <Link to="/app/support" className="hidden sm:flex p-2.5 rounded-xl hover:bg-mist-100 text-ink-700 transition-colors" aria-label="Help and support">
                <CircleHelp size={20} />
              </Link>
              <div className="relative">
                <button
                  className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-mist-100 transition-colors"
                  onClick={() => setMenuOpen(!menuOpen)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label="Account menu"
                >
                  <Avatar name={`${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email} size={34} />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden="true" />
                    <div className="absolute right-0 mt-2 w-52 card p-1.5 z-50 shadow-lg" role="menu">
                      <div className="px-3 py-2 border-b border-mist-100 mb-1">
                        <p className="text-sm font-bold truncate">{user?.firstName} {user?.lastName}</p>
                        <p className="text-xs text-ink-500 truncate">{user?.email}</p>
                      </div>
                      <Link to="/app/profile" className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-mist-50 text-sm font-medium" role="menuitem">
                        <UserRound size={16} /> Profile & security
                      </Link>
                      <Link to="/app/api" className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-mist-50 text-sm font-medium" role="menuitem">
                        <KeyRound size={16} /> API keys
                      </Link>
                      <button onClick={logout} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-red-50 text-sm font-medium text-red-700" role="menuitem">
                        <LogOut size={16} /> Logout
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        <main id="main" className="flex-1 w-full">
          <div className="mx-auto max-w-6xl px-4 pt-5 pb-28 lg:pb-10">{children}</div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-xl border-t border-mist-200 flex" aria-label="Mobile">
          {MOBILE_NAV.map((n) => (
            <NavLink key={n.href} to={n.href} end={n.end} className={({ isActive }) => `mnavlink ${isActive ? 'active' : ''}`}>
              {n.icon}
              {n.label}
            </NavLink>
          ))}
          <button className="mnavlink" onClick={() => setDrawer(true)} aria-label="More options">
            <Menu size={21} />
            More
          </button>
        </nav>
      </div>
      <ToastHost />
      <DialogHost />
    </div>
  );
}

/* Back-compat re-exports (pages import from kit going forward) */
export { EmptyState as Empty } from './kit';
export { InlineError as ErrorText } from './kit';
export { Field } from './kit';