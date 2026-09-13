import { test, expect } from '@playwright/test';

test('register → verify → login → dashboard', async ({ page }) => {
  const stamp = Date.now().toString().slice(-8);
  const email = `e2e${stamp}@example.com`;

  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();

  await page.getByLabel('First name').fill('E2E');
  await page.getByLabel('Last name').fill('Tester');
  await page.getByLabel('Username').fill(`e2e${stamp}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Phone').fill(`08055${stamp.slice(0, 6)}`);
  await page.getByLabel('Password', { exact: true }).fill('E2eTest123!');
  await page.getByLabel('Confirm password').fill('E2eTest123!');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();

  // Sandbox email verification step
  await expect(page.getByText('Account created')).toBeVisible();
  await page.getByRole('button', { name: /verify email/i }).click();

  // Login
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.getByLabel(/email, username or phone/i).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('E2eTest123!');
  await page.getByRole('button', { name: 'Log in' }).click();

  // Dashboard
  await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
  await expect(page.getByText('Available balance').first()).toBeVisible();
});

test('login with wrong password shows error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/email, username or phone/i).fill('demo@example.com');
  await page.getByLabel('Password', { exact: true }).fill('WrongPass123!');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert').first()).toBeVisible();
});
