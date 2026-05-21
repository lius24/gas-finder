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
  // The city-search shell is always present, with or without live data.
  await expect(page.getByRole('combobox')).toBeVisible();
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

test('city search shows an autocomplete dropdown', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('combobox');
  await search.fill('Troy');
  // Photon is a live external call; allow a generous window, assert the
  // listbox appears (results or a message — either proves the component wired).
  await expect(page.getByRole('listbox')).toBeVisible({ timeout: 10_000 });
});
