import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Landing, Login, Register, Forgot } from './pages/public';
import { Dashboard, Services, ServiceDetail, WalletPage, Transactions, Receipt } from './pages/customer';
import { ApiDashboard, ApiDocs, Bulk, Referrals, Notifications, Support, Profile } from './pages/platform';
import { AdminOverview, AdminAnalytics, AdminUsers, AdminUserDetail, AdminKyc, AdminServices, AdminProviders, AdminTransactions, AdminFinance, AdminPricing, AdminReports, AdminSupport, AdminApiLogs, AdminAudit, AdminNotifications, AdminTeam, AdminRoles, AdminSettings, AdminLayout } from './pages/admin';
import { AppLayout } from './components/ui';
import { getAccess } from './lib/api';

function Guard() {
  if (!getAccess()) return <Navigate to="/login" replace />;
  // Layout mounts once: navigation no longer refetches shell data per page.
  return <AppLayout><Outlet /></AppLayout>;
}

function AdminGuard() {
  if (!getAccess()) return <Navigate to="/login" replace />;
  // Layout mounts once: sidebar/header state and header data survive navigation.
  return <AdminLayout><Outlet /></AdminLayout>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/docs" element={<ApiDocs />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot" element={<Forgot />} />

        <Route path="/app" element={<Guard />}>
          <Route index element={<Dashboard />} />
          <Route path="services" element={<Services />} />
          <Route path="services/:slug" element={<ServiceDetail />} />
          <Route path="wallet" element={<WalletPage />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="transactions/:txId" element={<Receipt />} />
          <Route path="bulk" element={<Bulk />} />
          <Route path="api" element={<ApiDashboard />} />
          <Route path="referrals" element={<Referrals />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="support" element={<Support />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        <Route path="/admin" element={<AdminGuard />}>
          <Route index element={<AdminOverview />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="users/:id" element={<AdminUserDetail />} />
          <Route path="kyc" element={<AdminKyc />} />
          <Route path="services" element={<AdminServices />} />
          <Route path="providers" element={<AdminProviders />} />
          <Route path="transactions" element={<AdminTransactions />} />
          <Route path="finance" element={<AdminFinance />} />
          <Route path="pricing" element={<AdminPricing />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="support" element={<AdminSupport />} />
          <Route path="api-logs" element={<AdminApiLogs />} />
          <Route path="audit" element={<AdminAudit />} />
          <Route path="notifications" element={<AdminNotifications />} />
          <Route path="team" element={<AdminTeam />} />
          <Route path="roles" element={<AdminRoles />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
