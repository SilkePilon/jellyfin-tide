import { expect, test, type APIRequestContext } from '@playwright/test';
import { login } from './auth';

const CLIENT = 'MediaBrowser Client="e2e", Device="e2e", DeviceId="e2e", Version="1"';
const PLUGIN_ID = '7c1d3e5a-9b2f-4c6d-8e0a-1f3b5d7e9a2c';
async function auth(request: APIRequestContext) {
  const r = await request.post('/Users/AuthenticateByName', { headers: { Authorization: CLIENT }, data: { Username: 'tide', Pw: 'tide' } });
  const j = await r.json();
  return { headers: { Authorization: `${CLIENT}, Token="${j.AccessToken}"` } };
}
const currentUserName = (page: import('@playwright/test').Page) =>
  // getCurrentUser() rejects with no reason while nobody is signed in (mid switch), so that reads as null.
  page.evaluate(async () => {
    try { return ((await (window as any).ApiClient?.getCurrentUser())?.Name ?? null) as string | null; } catch { return null; }
  }).catch(() => null);

test('profiles over the poster wall; the stock page stays hidden', async ({ page }) => {
  await page.goto('/web/');
  await expect(page.locator('.tide-lg-card[data-state="profiles"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.tide-lg-person', { hasText: 'mila' })).toBeVisible();
  await expect(page.locator('.tide-lg-person', { hasText: 'noah' })).toBeVisible();
  expect(await page.locator('.tide-lg-wall i').count()).toBeGreaterThan(0);
  await expect(page.locator('#loginPage:not(.hide)')).toHaveCSS('opacity', '0');
});

test('wrong password shows the error in the card; right password signs in', async ({ page }) => {
  await page.goto('/web/');
  await page.locator('.tide-lg-person', { hasText: 'mila' }).click();
  await page.fill('.tide-lg-card input[name="password"]', 'nope');
  await page.keyboard.press('Enter');
  await expect(page.locator('.tide-lg-err')).toContainText('Invalid', { timeout: 15_000 });
  await page.fill('.tide-lg-card input[name="password"]', 'mila');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.tide-home', { timeout: 30_000 });
  expect(await currentUserName(page)).toBe('mila');
});

test('a profile without a password signs in with an empty field', async ({ page }) => {
  await page.goto('/web/');
  await page.locator('.tide-lg-person', { hasText: 'noah' }).click();
  await page.locator('.tide-lg-card button[type="submit"]').click();
  await page.waitForSelector('.tide-home', { timeout: 30_000 });
  expect(await currentUserName(page)).toBe('noah');
});

test('manual sign-in (Other user) works for a hidden user', async ({ page }) => {
  await login(page);
  expect(await currentUserName(page)).toBe('tide');
});

test('Quick Connect shows the six-digit code; Back returns to profiles', async ({ page }) => {
  await page.goto('/web/');
  await page.locator('.tide-lg-card [data-lg="qc"]').click();
  await expect(page.locator('.tide-lg-code b')).toHaveCount(6, { timeout: 15_000 });
  await page.locator('.tide-lg-card [data-lg="back"]').click();
  await expect(page.locator('.tide-lg-card[data-state="profiles"]')).toBeVisible();
});

test('Forgot password shows Jellyfin\'s answer and asks for the PIN', async ({ page }) => {
  await page.goto('/web/');
  await page.locator('.tide-lg-person', { hasText: 'mila' }).click();
  await page.locator('.tide-lg-card [data-lg="forgot"]').click();
  await expect(page.locator('.tide-lg-card input[name="username"]')).toHaveValue('mila');
  await page.locator('.tide-lg-card button[type="submit"]').click();
  await expect(page.locator('.tide-lg-card[data-state="pin"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.tide-lg-msg').first()).toContainText('server');
});

test('Switch profile: wrong password keeps you signed in; right password switches to mila', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'avatar menu');
  await login(page);
  await page.locator('.MuiAppBar-root button[aria-controls="app-user-menu"]').click();
  await page.locator('#app-user-menu .tide-switch-item').click();
  await expect(page.locator('.tide-sw')).toBeVisible();
  await page.locator('.tide-sw [data-user]', { hasText: 'mila' }).click();
  await page.fill('.tide-sw input[name="password"]', 'nope');
  await page.keyboard.press('Enter');
  await expect(page.locator('.tide-sw .tide-lg-err')).toContainText('Wrong password', { timeout: 15_000 });
  expect(await currentUserName(page)).toBe('tide');
  await page.fill('.tide-sw input[name="password"]', 'mila');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => location.hash.startsWith('#/home') || location.hash === '' || location.hash === '#/', null, { timeout: 30_000 });
  await page.waitForSelector('.tide-home', { timeout: 30_000 });
  await expect.poll(() => currentUserName(page), { timeout: 15_000 }).toBe('mila');
});

test('EnableLogin off: the stock sign-in is untouched', async ({ page, request }) => {
  const a = await auth(request);
  const url = `/Plugins/${PLUGIN_ID}/Configuration`;
  const original = await (await request.get(url, { headers: a.headers })).json();
  await request.post(url, { headers: a.headers, data: { ...original, EnableLogin: false } });
  try {
    await page.goto('/web/');
    await page.waitForSelector('#loginPage:not(.hide)', { timeout: 30_000 });
    await page.waitForTimeout(1500);
    await expect(page.locator('.tide-lg')).toHaveCount(0);
    await expect(page.locator('#loginPage:not(.hide) .visualLoginForm')).toBeVisible();
  } finally {
    await request.post(url, { headers: (await auth(request)).headers, data: { ...original, EnableLogin: true } });
  }
});
