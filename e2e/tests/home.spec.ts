import { expect, test, type Page, type APIRequestContext } from '@playwright/test';

const CLIENT = 'MediaBrowser Client="e2e", Device="e2e", DeviceId="e2e", Version="1"';
const TRANSPARENT = /^(transparent|rgba\(\s*0,\s*0,\s*0,\s*0(\.0+)?\s*\))$/;
const PLUGIN_ID = '7c1d3e5a-9b2f-4c6d-8e0a-1f3b5d7e9a2c';

async function login(page: Page) {
  await page.goto('/web/');
  await page.waitForSelector('input[type=password]');
  await page.fill('input[type=text], #txtManualName', 'tide');
  await page.fill('input[type=password]', 'tide');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.tide-home', { timeout: 30_000 });
}

async function authHeaders(request: APIRequestContext) {
  const auth = await request.post('/Users/AuthenticateByName', {
    headers: { Authorization: CLIENT },
    data: { Username: 'tide', Pw: 'tide' },
  });
  const token = (await auth.json()).AccessToken as string;
  return { Authorization: `${CLIENT}, Token="${token}"` };
}

test('home renders hero and rows', async ({ page }) => {
  await login(page);
  await expect(page.locator('body')).toHaveClass(/tide-theme/);
  await expect(page.locator('.tide-hero-slide.on')).toBeVisible();
  await expect(page.locator('section.tide-row:not([hidden])').first()).toBeVisible();
});

test('wide card: no text under it; hover reveals readable info + actions and is not clipped (desktop)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await login(page);
  const card = page.locator('section[data-row="latestMovies"] .tide-wide').nth(1);
  await card.scrollIntoViewIfNeeded();
  await expect(page.locator('.tide-card-title, .tide-card-sub')).toHaveCount(0);
  await expect(card.locator('.tide-wide-info')).toHaveCSS('opacity', '0');
  await card.hover();
  await expect(card.locator('.tide-wide-info')).toHaveCSS('opacity', '1');
  await expect(card.locator('.tide-fav-toggle')).toHaveCSS('opacity', '1');
  await page.waitForTimeout(500); // hover transition settles
  // The scaled card + 3px ring stays inside the track's visible box (the 0.1.0 clipping bug).
  const [c, t] = await Promise.all([card.boundingBox(), card.locator('xpath=ancestor::div[contains(@class,"tide-row-track")]').boundingBox()]);
  expect(c!.y - 3).toBeGreaterThanOrEqual(t!.y);
  expect(c!.y + c!.height + 3).toBeLessThanOrEqual(t!.y + t!.height);
});

test('row scrolling: chevron pages, drag scrolls without opening details (desktop)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await login(page);
  const row = page.locator('section[data-row="latestMovies"]');
  const track = row.locator('.tide-row-track');
  await row.scrollIntoViewIfNeeded();
  await row.hover();
  const next = row.locator('.tide-row-chev-next');
  await expect(next).toHaveCSS('opacity', '1');
  await expect(row.locator('.tide-row-chev-prev')).toHaveCSS('opacity', '0');
  await next.click();
  await expect.poll(() => track.evaluate((t) => t.scrollLeft)).toBeGreaterThan(100);
  await track.evaluate((t) => { t.style.scrollBehavior = 'auto'; t.scrollLeft = 0; });
  const box = (await track.boundingBox())!;
  const hash = await page.evaluate(() => location.hash);
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  expect(await track.evaluate((t) => t.scrollLeft)).toBeGreaterThan(50);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => location.hash)).toBe(hash);
});

test('cards per row adapt to window width', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop');
  for (const [w, n] of [[1920, 4.4], [1440, 3.4], [1200, 2.6], [900, 1.6]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    const page = await ctx.newPage();
    await login(page);
    const cw = await page.locator('.tide-wide').first().evaluate((c) => c.getBoundingClientRect().width);
    // n cards incl. the peek fit the viewport minus gutters (±6%)
    const gutter = w < 700 ? 16 : 56;
    const expected = (w - 2 * gutter - 22 * (n - 1.4)) / n;
    expect(Math.abs(cw - expected) / expected).toBeLessThan(0.06);
    await ctx.close();
  }
});

test('discover: clicking a poster brings it to the centre and updates the reason (desktop)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await login(page);
  const sec = page.locator('section[data-row="discover"]');
  await sec.scrollIntoViewIfNeeded();
  await expect(sec.locator('.tide-disc-poster.center')).toHaveCount(1, { timeout: 15_000 });
  await expect(sec.locator('.tide-row-title')).toHaveText('Discover');
  const other = sec.locator('.tide-disc-poster:not(.center)').first();
  const name = await other.getAttribute('aria-label');
  await other.click();
  await expect(sec.locator('.tide-disc-poster.center')).toHaveAttribute('aria-label', name!);
  await expect(sec.locator('.tide-disc-meta')).toContainText(name!);
});

test('new this week bento shows NEW tiles (desktop)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await login(page);
  const sec = page.locator('section[data-row="newThisWeek"]');
  await sec.scrollIntoViewIfNeeded();
  await expect(sec.locator('.tide-bento-tile').first()).toBeVisible({ timeout: 15_000 });
  expect(await sec.locator('.tide-bento-tile').count()).toBeGreaterThanOrEqual(3);
});

test('favourite keeps a grey button; only the heart turns red (desktop)', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'desktop');
  await login(page);
  const fav = page.locator('.tide-hero-slide.on .tide-fav-toggle');
  const was = await fav.getAttribute('aria-pressed');
  try {
    if (was === 'true') { await fav.click(); await expect(fav).toHaveAttribute('aria-pressed', 'false'); }
    const bgBefore = await fav.evaluate((b) => getComputedStyle(b).backgroundColor);
    await fav.click();
    await expect(fav).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(450);
    expect(await fav.evaluate((b) => getComputedStyle(b).backgroundColor)).toBe(bgBefore);
    expect(await fav.locator('.tide-ms').evaluate((i) => getComputedStyle(i).color)).toBe('rgb(255, 55, 95)');
  } finally {
    if ((await fav.getAttribute('aria-pressed')) !== was) await fav.click();
  }
});

test('top bar: breathing room above, every bar button (incl. another plugin\'s) is the same 44px circle (desktop)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await login(page);
  await page.evaluate(() => { const box = document.querySelector('.MuiAppBar-root .MuiToolbar-root > div:last-child')!; const b = document.createElement('button'); b.className = 'plugin-dummy'; b.innerHTML = '<span class="material-icons">casino</span>'; box.prepend(b); });
  const top = await page.locator('.MuiAppBar-root .MuiToolbar-root').evaluate((t) => t.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(16);
  const sizes = await page.locator('.MuiAppBar-root .MuiIconButton-root, .MuiAppBar-root .plugin-dummy').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; }));
  expect(new Set(sizes)).toEqual(new Set(['44x44']));
});

test('edit home: hide a row persists after reload', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'desktop');
  const h = await authHeaders(request);
  const orig = await (await request.get('/Tide/UserPrefs', { headers: h })).json();
  const random = () => page.locator('section.tide-row[data-row="random"]');
  const scrollUntilRow = async () => {
    await expect
      .poll(async () => {
        if (await random().count()) return true;
        await page.mouse.wheel(0, 2000);
        return false;
      }, { timeout: 20_000, intervals: [300] })
      .toBe(true);
  };
  try {
    await login(page);
    await scrollUntilRow();
    await expect(random()).not.toHaveAttribute('hidden', /.*/);
    await page.getByRole('button', { name: /Edit home/ }).click();
    const box = page.locator('.tide-edit-panel .tide-edit-item').filter({ hasText: 'Something different' }).locator('input[type=checkbox]');
    await expect(box).toBeChecked();
    await box.uncheck();
    // Reload only after the PUT landed (reloading earlier races the save and flakes).
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/Tide/UserPrefs') && r.request().method() === 'PUT'),
      page.getByRole('button', { name: 'Save' }).click(),
    ]);
    await page.reload();
    await page.waitForSelector('.tide-home');
    await expect(page.locator('section.tide-row[data-row]').first()).toBeAttached();
    for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 2500); await page.waitForTimeout(250); }
    await expect(random()).toHaveCount(0);
  } finally {
    try {
      const r = await request.put('/Tide/UserPrefs', { headers: h, data: { ...orig, edited: orig.edited ?? true } });
      if (!r.ok()) console.log('prefs restore failed', r.status());
    } catch (e) { console.log('prefs restore error', e); }
  }
});

test('phone shows tab bar and no row arrows', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone');
  await login(page);
  await expect(page.locator('.tide-tabbar')).toBeVisible();
  await expect(page.locator('.tide-row-chev').first()).toBeHidden();
});

test('hero starts at top under transparent app bar (desktop)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await login(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('.tide-hero')).toBeVisible();
  const box = await page.locator('.tide-hero').boundingBox();
  expect(Math.abs(box!.y)).toBeLessThanOrEqual(2);
  const bar = page.locator('.MuiAppBar-root').first();
  const bg = () => bar.evaluate((e) => getComputedStyle(e).backgroundColor);
  await expect.poll(bg).toMatch(TRANSPARENT);
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, 400);
  await expect.poll(bg).not.toMatch(TRANSPARENT);
});

test('phone hero meta does not overflow and dots do not overlap (phone)', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone');
  await login(page);
  await expect(page.locator('.tide-hero-slide.on')).toBeVisible();
  await expect(page.locator('.tide-t3-item').first()).toBeAttached();
  const m = await page.evaluate(() => {
    const r = (el: Element | null) => (el ? el.getBoundingClientRect() : null);
    const slide = document.querySelector('.tide-hero-slide.on')!;
    const meta = slide.querySelector('.tide-hero-meta-ph') as HTMLElement | null;
    const metaVisible = !!meta && getComputedStyle(meta).display !== 'none';
    const overlap = (a: DOMRect | null, b: DOMRect | null) =>
      !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const dots = [...document.querySelectorAll('.tide-t3-bar, .tide-t3-item')].map(r);
    const bars = [...document.querySelectorAll('.tide-t3-bar')].map(r) as DOMRect[];
    const items = [...document.querySelectorAll('.tide-t3-item')].map(r) as DOMRect[];
    const play = r(slide.querySelector('.tide-btn-w'));
    const btns = r(slide.querySelector('.tide-hero-btns'))!;
    const txt = r(slide.querySelector('.tide-hero-txt'))!;
    const hero = r(document.querySelector('.tide-hero'))!;
    const title = r(document.querySelector('section.tide-row:not([hidden]) .tide-row-title'));
    const dotsTop = Math.min(...bars.map((b) => b.top));
    const dotsBottom = Math.max(...bars.map((b) => b.bottom));
    return {
      gapDotsToTitle: title ? title.top - dotsBottom : null,
      gapButtonsToDots: dotsTop - btns.bottom,
      txtEndAboveHeroBottom: hero.bottom - txt.bottom,
      minDotHitWidth: Math.min(...items.map((i) => i.width)),
      minDotHitHeight: Math.min(...items.map((i) => i.height)),
      metaVisible,
      scroll: meta?.scrollWidth ?? 0,
      client: meta?.clientWidth ?? 0,
      dotsCount: dots.length,
      dotPlay: dots.some((d) => overlap(d, play)),
      dotTitle: dots.some((d) => overlap(d, title)),
    };
  });
  expect(m.metaVisible).toBe(true);
  expect(m.scroll).toBeLessThanOrEqual(m.client);
  expect(m.dotsCount).toBeGreaterThan(0);
  expect(m.dotPlay).toBe(false);
  expect(m.dotTitle).toBe(false);
  // Spacing contract (phone-hero brief): dots clear of the first row title and of the buttons, text well inside the hero.
  expect(m.gapDotsToTitle).not.toBeNull();
  expect(m.gapDotsToTitle!).toBeGreaterThanOrEqual(8);
  expect(m.gapButtonsToDots).toBeGreaterThanOrEqual(0);
  expect(m.txtEndAboveHeroBottom).toBeGreaterThanOrEqual(44);
  expect(m.minDotHitWidth).toBeGreaterThanOrEqual(44);
  expect(m.minDotHitHeight).toBeGreaterThanOrEqual(44);
});

test('hero favourite toggle reflects state (desktop)', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'desktop');
  const h = await authHeaders(request);
  await login(page);
  const fav = page.locator('.tide-hero-slide.on button[aria-label="Favourite"]');
  await expect(fav).toBeVisible();
  await expect(page.locator('.tide-hero-slide.on button[aria-label="Watchlist"]')).toHaveCount(0);
  const before = await fav.getAttribute('aria-pressed');
  const id = await page.locator('.tide-hero-slide.on').evaluate(() => (window as any).ApiClient.getCurrentUserId() as string);
  const heroId = (await (await request.get('/Tide/Home', { headers: h })).json()).hero[0].id as string;
  try {
    await fav.click();
    await expect(fav).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
    await expect
      .poll(async () => (await (await request.get(`/Items/${heroId}?userId=${id}`, { headers: h })).json()).UserData.IsFavorite)
      .toBe(before !== 'true');
  } finally {
    await request.fetch(`/UserFavoriteItems/${heroId}?userId=${id}`, { method: before === 'true' ? 'POST' : 'DELETE', headers: h });
  }
});

test('disabling home restores stock home', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'desktop');
  const h = await authHeaders(request);
  const cfg = await (await request.get(`/Plugins/${PLUGIN_ID}/Configuration`, { headers: h })).json();
  await request.post(`/Plugins/${PLUGIN_ID}/Configuration`, { headers: h, data: { ...cfg, EnableHome: false } });
  try {
    await page.goto('/web/');
    await page.waitForSelector('input[type=password]');
    await page.fill('input[type=text], #txtManualName', 'tide');
    await page.fill('input[type=password]', 'tide');
    await page.keyboard.press('Enter');
    await expect(page.locator('#indexPage.homePage, #homeTab').first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500); // grace: Tide would mount shortly after stock home
    await expect(page.locator('.tide-home')).toHaveCount(0);
    await expect(page.locator('body')).toHaveClass(/tide-theme/);
  } finally {
    await request.post(`/Plugins/${PLUGIN_ID}/Configuration`, { headers: h, data: { ...cfg, EnableHome: true } });
  }
});

test('boot survives a slow login: 12 s on the login page, then Tide home mounts (desktop)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(90_000);
  await page.goto('/web/');
  await page.waitForSelector('input[type=password]');
  await page.waitForTimeout(12_000); // longer than the 10 s ApiClient timeout
  await page.fill('input[type=text], #txtManualName', 'tide');
  await page.fill('input[type=password]', 'tide');
  await page.keyboard.press('Enter');
  await expect(page.locator('.tide-home')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('body')).toHaveClass(/tide-theme/);
});

test('hero Play starts the stock player (desktop)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await login(page);
  await page.locator('.tide-hero-slide.on .tide-btn-w').click();
  await expect.poll(async () => page.url().includes('#/video') || (await page.locator('video').count()) > 0, { timeout: 20_000 }).toBe(true);
  expect(page.url()).not.toContain('#/details');
});

test('phone avatar has no filled circle over the hero (phone)', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone');
  await login(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  const avatar = page.locator('.MuiAppBar-root .MuiAvatar-root').first();
  await expect(avatar).toBeVisible();
  const bgs = await avatar.evaluate((el) => {
    const btn = el.closest('.MuiButtonBase-root');
    return [getComputedStyle(el).backgroundColor, btn ? getComputedStyle(btn).backgroundColor : 'rgba(0, 0, 0, 0)'];
  });
  for (const bg of bgs) expect(bg).toMatch(TRANSPARENT);
});

test('tab bar routes open real pages (phone)', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone');
  await login(page);
  for (const [label, hash, pageId] of [['Movies', '#/movies', '#moviesPage'], ['Shows', '#/tv', '#tvshowsPage'], ['Search', '#/search', '#searchPage']]) {
    await page.locator('.tide-tabbar a', { hasText: label }).click();
    await expect.poll(() => new URL(page.url()).hash).toContain(hash);
    await expect(page.locator(`${pageId}:not(.hide)`).first()).toBeVisible({ timeout: 15_000 });
    if (label !== 'Search') await expect(page.locator(`${pageId}:not(.hide) .card`).first()).toBeVisible({ timeout: 15_000 });
  }
});

test('row title link and details route open real pages (desktop)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await login(page);
  const title = page.locator('section.tide-row[data-row="latestMovies"] a.tide-row-title');
  await title.scrollIntoViewIfNeeded();
  await title.click();
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#\/movies/);
  await expect(page.locator('#moviesPage:not(.hide) .card').first()).toBeVisible({ timeout: 15_000 });

  await page.goBack();
  await page.waitForSelector('section[data-row="latestMovies"] .tide-wide');
  const card = page.locator('section[data-row="latestMovies"] .tide-wide').first();
  const id = await card.getAttribute('data-id');
  await card.locator('.tide-wide-art').click({ position: { x: 40, y: 20 } }); // card click -> ROUTES.details
  await expect.poll(() => new URL(page.url()).hash).toBe(`#/details?id=${id}`);
  await expect(page.locator('.itemDetailPage:not(.hide), #itemDetailPage:not(.hide)').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.itemDetailPage:not(.hide) .itemName').filter({ hasText: /\S/ }).first()).toBeVisible({ timeout: 15_000 });
});
