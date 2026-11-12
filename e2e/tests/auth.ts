import type { Page } from '@playwright/test';

/** Sign in through whichever sign-in is showing: Tide's login screen (0.6.0+) or the stock page. */
export async function login(page: Page, user = 'tide', password = 'tide'): Promise<void> {
  await page.goto('/web/');
  await fillSignIn(page, user, password);
  await page.keyboard.press('Enter');
  await page.waitForSelector('.tide-home', { timeout: 30_000 });
  // Clicking "Other user" leaves the pointer mid-screen, where it would hover whatever Home puts there.
  await page.mouse.move(0, 0);
}

/** Fill the sign-in that is showing (Tide's card or the stock page) without submitting it. */
export async function fillSignIn(page: Page, user = 'tide', password = 'tide'): Promise<void> {
  // Prefer Tide's card: a selector list would latch onto the hidden stock field that comes first in the DOM.
  const tide = await page.locator('.tide-lg-card').waitFor({ timeout: 15_000 }).then(() => true, () => false);
  if (tide) {
    const other = page.locator('.tide-lg-card [data-lg="other"]');
    if (await other.count()) await other.click();
    await page.fill('.tide-lg-card input[name="username"]', user);
    await page.fill('.tide-lg-card input[name="password"]', password);
  } else {
    const manual = page.locator('#loginPage:not(.hide) .btnManual');
    if (await manual.isVisible().catch(() => false)) await manual.click();
    await page.fill('#loginPage:not(.hide) #txtManualName', user);
    await page.fill('#loginPage:not(.hide) #txtManualPassword', password);
  }
}
