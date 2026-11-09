import { expect, test, type Page, type APIRequestContext } from '@playwright/test';

const CLIENT = 'MediaBrowser Client="e2e", Device="e2e", DeviceId="e2e", Version="1"';
const PLUGIN_ID = '7c1d3e5a-9b2f-4c6d-8e0a-1f3b5d7e9a2c';

async function login(page: Page) {
  await page.goto('/web/');
  await page.waitForSelector('input[type=password]');
  await page.fill('input[type=text], #txtManualName', 'tide');
  await page.fill('input[type=password]', 'tide');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.tide-home', { timeout: 30_000 });
}
async function auth(request: APIRequestContext) {
  const r = await request.post('/Users/AuthenticateByName', { headers: { Authorization: CLIENT }, data: { Username: 'tide', Pw: 'tide' } });
  const j = await r.json();
  return { headers: { Authorization: `${CLIENT}, Token="${j.AccessToken}"` }, userId: j.User.Id as string };
}
async function find(request: APIRequestContext, type: string, name: string) {
  const a = await auth(request);
  const r = await request.get(`/Items?userId=${a.userId}&Recursive=true&IncludeItemTypes=${type}&SearchTerm=${encodeURIComponent(name)}`, { headers: a.headers });
  return (await r.json()).Items[0].Id as string;
}

test('movie detail replaces the stock page', async ({ page, request }) => {
  const id = await find(request, 'Movie', 'Sintel');
  await login(page);
  await page.goto(`/web/#/details?id=${id}`);
  await expect(page.locator('#itemDetailPage:not(.hide) .tide-details .tide-dh')).toBeVisible();
  await expect(page.locator('#itemDetailPage:not(.hide) > .detailPageWrapperContainer')).toBeHidden();
  await expect(page.locator('.tide-dh-primary')).toContainText(/Play|Resume/);
  await expect(page.locator('.tide-file')).toBeVisible();
});

test('series: season menu switches the row; season link redirects with hint', async ({ page, request }) => {
  const id = await find(request, 'Series', 'Blender Shorts');
  await login(page);
  await page.goto(`/web/#/details?id=${id}`);
  await expect(page.locator('.tide-ep-dd')).toBeVisible();
  await page.locator('.tide-ep-dd').click();
  await page.locator('.tide-pop .tide-pop-item', { hasText: 'Season 2' }).click();
  await expect(page.locator('.tide-ep-dd')).toContainText('Season 2');
  await expect(page.locator('.tide-eps .tide-wide-epmode')).toHaveCount(1);

  const a = await auth(request);
  const seasons = await (await request.get(`/Shows/${id}/Seasons?userId=${a.userId}`, { headers: a.headers })).json();
  const s2 = seasons.Items.find((s: { IndexNumber: number }) => s.IndexNumber === 2).Id;
  await page.goto(`/web/#/details?id=${s2}`);
  await expect(page).toHaveURL(new RegExp(`id=${id}&season=2`));
  await expect(page.locator('.tide-ep-dd')).toContainText('Season 2');
});

test('next up strip shows for a started series and hides when all watched', async ({ page, request }) => {
  const id = await find(request, 'Series', 'Blender Shorts');
  const a = await auth(request);
  const eps = (await (await request.get(`/Shows/${id}/Episodes?userId=${a.userId}`, { headers: a.headers })).json()).Items;
  await request.post(`/UserPlayedItems/${eps[0].Id}?userId=${a.userId}`, { headers: a.headers });
  await login(page);
  await page.goto(`/web/#/details?id=${id}`);
  await expect(page.locator('.tide-nu')).toBeVisible();
  await request.post(`/UserPlayedItems/${id}?userId=${a.userId}`, { headers: a.headers });
  await page.reload();
  await expect(page.locator('.tide-dh')).toBeVisible();
  await expect(page.locator('.tide-nu')).toHaveCount(0);
  await request.delete(`/UserPlayedItems/${id}?userId=${a.userId}`, { headers: a.headers });
});

test('hovered cards are not clipped; chevron glides to a card edge', async ({ page, request }, info) => {
  test.skip(info.project.name === 'phone', 'hover');
  const id = await find(request, 'Series', 'Blender Shorts');
  await login(page);
  await page.goto(`/web/#/details?id=${id}`);
  const card = page.locator('.tide-eps .tide-wide').first();
  await card.hover();
  await page.waitForTimeout(500);
  const box = await card.boundingBox();
  const track = await page.locator('.tide-eps .tide-row-track').boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(track!.y);
  // chevron motion on a home row with enough cards
  await page.goto('/web/#/home');
  const row = page.locator('.tide-row-scroller.can-next').first();
  await row.hover();
  const next = row.locator('.tide-row-chev-next');
  await expect(next).toHaveCSS('opacity', '1');
  const t = row.locator('.tide-row-track');
  await next.click();
  await page.waitForTimeout(120);
  const mid = await t.evaluate((el) => el.scrollLeft);
  await page.waitForTimeout(700);
  const end = await t.evaluate((el) => el.scrollLeft);
  expect(mid).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(mid);
  const aligned = await t.evaluate((el) => {
    const pad = parseFloat(getComputedStyle(el).paddingLeft);
    const left = el.getBoundingClientRect().left + pad;
    return [...el.children].some((c) => Math.abs(c.getBoundingClientRect().left - left) < 2);
  });
  expect(aligned).toBe(true);
});

test('a mouse-wheel notch scrolls the page over several frames', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'wheel');
  await login(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(60);
  const early = await page.evaluate(() => window.scrollY);
  await page.waitForTimeout(600);
  const late = await page.evaluate(() => window.scrollY);
  expect(early).toBeLessThan(late);
  expect(Math.abs(late - 100)).toBeLessThan(8);
});

test('person chip opens the stock person page; similar card remounts', async ({ page, request }) => {
  const id = await find(request, 'Movie', 'Sintel');
  await login(page);
  await page.goto(`/web/#/details?id=${id}`);
  const chip = page.locator('.tide-chipp').first();
  if (await chip.count()) {
    await chip.click();
    await expect(page.locator('#itemDetailPage:not(.hide) .tide-details')).toHaveCount(0);
  }
  await page.goto(`/web/#/details?id=${id}`);
  const sim = page.locator('.tide-similar .tide-wide').first();
  if (await sim.count()) {
    const before = await page.locator('.tide-dh-logo, .tide-dh-title').first().getAttribute('alt');
    await sim.click();
    await expect(page.locator('#itemDetailPage:not(.hide) .tide-details')).toHaveCount(1);
    await expect.poll(async () => page.locator('#itemDetailPage:not(.hide) .tide-dh-logo, #itemDetailPage:not(.hide) .tide-dh-title').first().getAttribute('alt')).not.toBe(before);
  }
});

test('favourite heart is a solid red SVG when on', async ({ page, request }) => {
  const id = await find(request, 'Movie', 'Sintel');
  await login(page);
  await page.goto(`/web/#/details?id=${id}`);
  const fav = page.locator('.tide-dh .tide-fav-toggle');
  if ((await fav.getAttribute('aria-pressed')) === 'true') await fav.click();
  await fav.click();
  await expect(fav).toHaveAttribute('aria-pressed', 'true');
  await expect(fav.locator('svg path')).toHaveCSS('fill', 'rgb(255, 55, 95)');
  await fav.click();
  await expect(fav.locator('svg path')).toHaveCSS('fill', 'rgba(0, 0, 0, 0)');
});

test('enableDetails=false keeps the stock page', async ({ page, request }) => {
  const a = await auth(request);
  const cfgUrl = `/Plugins/${PLUGIN_ID}/Configuration`;
  const original = await (await request.get(cfgUrl, { headers: a.headers })).json();
  await request.post(cfgUrl, { headers: a.headers, data: { ...original, EnableDetails: false } });
  try {
    const id = await find(request, 'Movie', 'Sintel');
    await login(page);
    await page.goto(`/web/#/details?id=${id}`);
    await expect(page.locator('#itemDetailPage:not(.hide) .detailPageWrapperContainer')).toBeVisible();
    await expect(page.locator('.tide-details')).toHaveCount(0);
  } finally {
    // A fresh login: find() re-authenticated with the same DeviceId, which revokes the earlier token.
    await request.post(cfgUrl, { headers: (await auth(request)).headers, data: { ...original, EnableDetails: true } });
  }
});

test('phone layout: no poster column, full-width primary', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'phone', 'phone only');
  const id = await find(request, 'Movie', 'Sintel');
  await login(page);
  await page.goto(`/web/#/details?id=${id}`);
  await expect(page.locator('.tide-dh-poster')).toBeHidden();
  const b = await page.locator('.tide-dh-primary').boundingBox();
  expect(b!.width).toBeGreaterThan(300);
});

test('phone series page fits the screen (the next-up strip must not widen the header)', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'phone', 'phone only');
  const id = await find(request, 'Series', 'Blender Shorts');
  await login(page);
  await page.goto(`/web/#/details?id=${id}`);
  await expect(page.locator('#itemDetailPage:not(.hide) .tide-nu')).toBeVisible();
  const vw = page.viewportSize()!.width;
  for (const sel of ['.tide-dh-col', '.tide-dh-primary', '.tide-nu']) {
    const box = await page.locator(`#itemDetailPage:not(.hide) ${sel}`).first().boundingBox();
    expect(box!.x + box!.width, sel).toBeLessThanOrEqual(vw + 1);
  }
});

test('play icon inside any progress ring is not rotated (only the ring is)', async ({ page }) => {
  await login(page);
  const out = await page.evaluate(() => ['tide-ring tide-wide-ring', 'tide-end-ring', 'tide-ld-ring'].map((cls) => {
    const ring = document.createElement('span');
    ring.className = cls;
    ring.innerHTML = '<svg class="r" viewBox="0 0 32 32"></svg><span class="tide-ms tide-svg"><svg class="i" viewBox="0 0 24 24"></svg></span>';
    document.body.append(ring);
    const t = [getComputedStyle(ring.querySelector('svg.r')!).transform, getComputedStyle(ring.querySelector('svg.i')!).transform];
    ring.remove();
    return [cls, ...t];
  }));
  for (const [cls, ringT, iconT] of out) {
    expect(ringT, cls).not.toBe('none');
    expect(iconT, cls).toBe('none');
  }
});

test('the ⋯ menu and season dropdown open above the sections below them', async ({ page, request }, info) => {
  test.skip(info.project.name === 'phone', 'desktop');
  const id = await find(request, 'Series', 'Blender Shorts');
  await login(page);
  await page.goto(`/web/#/details?id=${id}`);
  const topmost = async (sel: string) => page.locator(sel).last().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && el.contains(hit);
  });
  await page.locator('.tide-ep-dd').click();
  await expect(page.locator('.tide-pop .tide-pop-item').last()).toBeVisible();
  expect(await topmost('.tide-pop .tide-pop-item')).toBe(true);
  await page.keyboard.press('Escape');
  // Sintel has cast chips right under the header: the ⋯ menu must cover them.
  await page.goto(`/web/#/details?id=${await find(request, 'Movie', 'Sintel')}`);
  await expect(page.locator('#itemDetailPage:not(.hide) .tide-chipp').first()).toBeVisible();
  await page.locator('#itemDetailPage:not(.hide) .tide-dh-more').click();
  await expect(page.locator('.tide-pop .tide-pop-item').last()).toBeVisible();
  expect(await topmost('.tide-pop .tide-pop-item')).toBe(true);
});
