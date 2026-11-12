import { expect, test } from '@playwright/test';
import { login } from './auth';


test('search: the app-bar button opens the dialog; typing shows grouped results; Enter opens details', async ({ page }) => {
  await login(page);
  await page.locator('.MuiAppBar-root a[href="#/search"]').click();
  await expect(page.locator('.tide-sd-wrap.open .tide-sd')).toBeVisible();
  expect(page.url()).not.toContain('#/search');
  await page.locator('.tide-sd-q').fill('sintel');
  await expect(page.locator('.tide-sd-top b')).toHaveText('Sintel');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/details\?id=/);
  await expect(page.locator('.tide-sd-wrap.open')).toHaveCount(0);
});

test('search: / opens it, Esc closes, the recent search is offered next time', async ({ page }) => {
  await login(page);
  await page.keyboard.press('/');
  await expect(page.locator('.tide-sd-wrap.open')).toBeVisible();
  await page.locator('.tide-sd-q').fill('spring');
  await expect(page.locator('.tide-sd-top b')).toHaveText('Spring');
  await page.keyboard.press('Enter');
  await page.goto('/web/#/home');
  await page.waitForSelector('.tide-home');
  await page.keyboard.press('/');
  await expect(page.locator('[data-recent] .tide-sd-rl').first()).toHaveText('spring');
  await page.keyboard.press('Escape');
  await expect(page.locator('.tide-sd-wrap.open')).toHaveCount(0);
});

test('search: the stock #/search route opens the dialog instead', async ({ page }) => {
  await login(page);
  await page.goto('/web/#/search');
  await expect(page.locator('.tide-sd-wrap.open')).toBeVisible();
  await expect.poll(() => page.evaluate(() => location.hash)).not.toContain('search');
});

test('search on phone is full screen', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone');
  await login(page);
  await page.goto('/web/#/search');
  const box = await page.locator('.tide-sd').boundingBox();
  const vp = page.viewportSize()!;
  expect(Math.round(box!.width)).toBe(vp.width);
});
