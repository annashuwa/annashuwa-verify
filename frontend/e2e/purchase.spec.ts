import { test, expect } from '@playwright/test';

async function loginAsDemo(page: any) {
  await page.goto('/login');
  await page.getByLabel(/email, username or phone/i).fill('demo@example.com');
  await page.getByLabel('Password', { exact: true }).fill('Demo123!');
  await page.getByRole('button', { name: 'Log in' }).click();
  // Wait for real navigation — the login form's own heading would otherwise
  // satisfy a content assertion before the session exists.
  await expect(page).toHaveURL(/\/app(\/|$)/, { timeout: 15000 });
  await expect(page.getByText('Available balance').first()).toBeVisible({ timeout: 15000 });
}

test('fund wallet → NIN verify → receipt', async ({ page }) => {
  await loginAsDemo(page);

  // Fund wallet (scoped to the funding card to avoid the wallet-card button)
  await page.goto('/app/wallet');
  await page.getByLabel(/amount \(₦\)/i).fill('1000');
  await page.locator('.card', { hasText: 'Minimum ₦100' }).getByRole('button', { name: 'Fund wallet' }).click();
  await expect(page.getByText(/wallet funded/i).first()).toBeVisible({ timeout: 15000 });

  // Browse services and open NIN verification
  await page.goto('/app/services');
  await expect(page.getByRole('heading', { name: 'Verification services' })).toBeVisible();
  await page.getByRole('link', { name: /nin verification/i }).first().click();
  await expect(page.getByRole('heading', { name: 'NIN Verification' })).toBeVisible();

  // Submit a valid sandbox NIN (ends 11 → success). Exact label match:
  // the form itself carries "NIN Verification form" as its accessible name.
  const nin = '81' + Date.now().toString().slice(-7) + '11';
  await page.getByLabel('NIN', { exact: true }).fill(nin);
  await page.getByRole('button', { name: /pay.*verify/i }).click();

  // Receipt
  await expect(page.getByRole('heading', { name: 'Transaction receipt' })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('SUCCESSFUL').first()).toBeVisible();
  await expect(page.getByText('Verified result').first()).toBeVisible();
});

test('failed verification surfaces failure state', async ({ page }) => {
  await loginAsDemo(page);
  await page.goto('/app/services/nin-verification');
  await page.getByLabel('NIN', { exact: true }).fill('81000000000'); // ends 00 → invalid ID
  await page.getByRole('button', { name: /pay.*verify/i }).click();
  await expect(page.getByRole('heading', { name: 'Transaction receipt' })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('FAILED').first()).toBeVisible();
});
