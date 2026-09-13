import { test, expect } from '@playwright/test';

async function loginAsAdmin(page: any) {
  await page.goto('/login');
  await page.getByLabel(/email, username or phone/i).fill('admin@example.com');
  await page.getByLabel('Password', { exact: true }).fill('Admin123!');
  await page.getByRole('button', { name: 'Log in' }).click();
  // Wait for real navigation — never assert on content that also exists
  // on the login form itself.
  await expect(page).toHaveURL(/\/admin(\/|$)/, { timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20000 });
}

async function openGroup(page: any, name: string) {
  const btn = page.getByRole('button', { name, exact: true });
  if ((await btn.getAttribute('aria-expanded')) === 'false') await btn.click();
}

function adminNav(page: any) {
  return page.getByRole('navigation', { name: 'Admin navigation' });
}

test('public landing + api docs render', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /verify identities/i })).toBeVisible();
  await page.goto('/docs');
  await expect(page.getByRole('heading', { name: 'API documentation' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Authentication' })).toBeVisible();
});

test('admin dashboard + customers + providers (read-only)', async ({ page }) => {
  await loginAsAdmin(page);
  await expect(page.getByText('Wallet liability').first()).toBeVisible();
  await expect(page.getByText('Verification statistics').first()).toBeVisible();

  await openGroup(page, 'Customers');
  await adminNav(page).getByRole('link', { name: 'All Customers' }).click();
  await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();
  await expect(page.getByText('demo@example.com').first()).toBeVisible({ timeout: 15000 });

  await openGroup(page, 'Providers & API');
  await adminNav(page).getByRole('link', { name: 'API Providers' }).click();
  await expect(page.getByRole('heading', { name: 'API Providers' })).toBeVisible();
  await expect(page.getByText(/mock-nin-1/i).first()).toBeVisible();
});

test('admin customer profile renders wallet + security', async ({ page }) => {
  await loginAsAdmin(page);
  await openGroup(page, 'Customers');
  await adminNav(page).getByRole('link', { name: 'All Customers' }).click();
  await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();
  await page.getByRole('link', { name: 'Profile' }).first().click();
  await expect(page.getByText('Wallet adjustment').first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Verification activity').first()).toBeVisible();
  await expect(page.getByText('Security', { exact: true }).first()).toBeVisible();
});

test('admin verifications list + detail modal', async ({ page }) => {
  // Self-sufficient: create a verification via API so the list is never empty.
  const login = await page.request.post('/api/auth/login', {
    data: { identifier: 'demo@example.com', password: 'Demo123!' },
  });
  const { data } = await login.json();
  await page.request.post('/api/verify/nin-verification', {
    headers: { Authorization: `Bearer ${data.accessToken}`, 'Idempotency-Key': `e2e-${Date.now()}` },
    data: { nin: '91' + Date.now().toString().slice(-7) + '11' },
  });
  await loginAsAdmin(page);
  await openGroup(page, 'Verifications');
  await adminNav(page).getByRole('link', { name: 'All Verifications' }).click();
  await expect(page.getByRole('heading', { name: 'Verifications' })).toBeVisible();
  // Scope to the table: the sidebar group toggle "Overview" also contains
  // the substring "view" in its accessible name.
  const view = page.locator('table').getByRole('button', { name: 'View', exact: true }).first();
  await expect(view).toBeVisible({ timeout: 15000 });
  await view.click();
  await expect(page.getByText('Request information').first()).toBeVisible();
  await expect(page.getByText('Verification result').first()).toBeVisible();
});

test('admin analytics + finance render live charts', async ({ page }) => {
  await loginAsAdmin(page);
  await openGroup(page, 'Overview');
  await adminNav(page).getByRole('link', { name: 'Analytics' }).click();
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
  await expect(page.getByText('Verification volume').first()).toBeVisible();

  await openGroup(page, 'Finance');
  await adminNav(page).getByRole('link', { name: 'Financial Overview' }).click();
  await expect(page.getByRole('heading', { name: 'Financial Overview' })).toBeVisible();
  await expect(page.getByText('Wallet liability').first()).toBeVisible();
});

test('admin sidebar becomes a drawer on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsAdmin(page);
  // Sidebar hidden, menu button visible
  await expect(page.getByRole('button', { name: 'Open admin menu' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Admin navigation' })).toBeHidden();
  await page.getByRole('button', { name: 'Open admin menu' }).click();
  await expect(page.getByRole('dialog', { name: 'Admin menu' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Admin menu' }).getByRole('link', { name: 'Analytics', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
});
