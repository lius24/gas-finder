import { expect, test } from '@playwright/test';

// Smoke test for the Pumps happy path — the safety net for a full
// render-layer rewrite. Backend-independent on purpose: a smoke test
// proves the app boots, routes, and responds to input, not that the
// Supabase pipeline returns live data.

test('cold visit renders the Ferrari Pumps shell', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /worth\s+driving\s+for/i }),
  ).toBeVisible();
  // Station cards render (sample cards when no live data).
  await expect(page.locator('.fp-card').first()).toBeVisible();
});

test('octane tabs toggle selection', async ({ page }) => {
  await page.goto('/');
  const reg = page.getByRole('tab', { name: /87/ });
  const premium = page.getByRole('tab', { name: /91\+/ });

  await expect(premium).toHaveAttribute('aria-selected', 'true');
  await reg.click();
  await expect(reg).toHaveAttribute('aria-selected', 'true');
  await expect(premium).toHaveAttribute('aria-selected', 'false');
});

test('sort control updates pressed state', async ({ page }) => {
  await page.goto('/');
  const closest = page.getByRole('button', { name: 'Closest', exact: true });
  await closest.click();
  await expect(closest).toHaveAttribute('aria-pressed', 'true');
});

test('nav routes to About and back to Pumps', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'About', exact: true }).first().click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole('heading', { name: /math/i })).toBeVisible();

  await page.getByRole('link', { name: 'Pumps', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('sign-in route shows the email form', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: /sign in to pump/i })).toBeVisible();
  await expect(page.getByPlaceholder(/you@example/i)).toBeVisible();
});
