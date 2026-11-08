import { expect, test, type Page, type APIRequestContext } from '@playwright/test';

const CLIENT = 'MediaBrowser Client="e2e", Device="e2e", DeviceId="e2e", Version="1"';
const PLUGIN_ID = '7c1d3e5a-9b2f-4c6d-8e0a-1f3b5d7e9a2c';
test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

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
async function firstEpisode(request: APIRequestContext) {
  const a = await auth(request);
  const r = await request.get(`/Items?userId=${a.userId}&Recursive=true&IncludeItemTypes=Episode&SortBy=ParentIndexNumber,IndexNumber`, { headers: a.headers });
  return (await r.json()).Items[0].Id as string;
}
async function startPlayback(page: Page, id: string) {
  await page.goto(`/web/#/details?id=${id}`);
  await page.locator('#itemDetailPage:not(.hide) .tide-dh-primary').click();
  await page.waitForSelector('.tide-player .tide-pc', { timeout: 60_000 });
  await page.waitForFunction(() => { const v = document.querySelector('video'); return !!v && v.currentTime > 0.5; }, null, { timeout: 60_000 });
}

test('loading screen appears on play and fades when the video plays', async ({ page, request }) => {
  const id = await firstEpisode(request);
  await login(page);
  await page.goto(`/web/#/details?id=${id}`);
  await page.locator('#itemDetailPage:not(.hide) .tide-dh-primary').click();
  await expect(page.locator('.tide-ld.show')).toBeVisible();
  await expect(page.locator('.tide-ld-line')).toContainText('S1 · E1');
  await page.waitForFunction(() => { const v = document.querySelector('video'); return !!v && v.currentTime > 0.5; }, null, { timeout: 60_000 });
  await expect(page.locator('.tide-ld.show')).toHaveCount(0);
});

test('Tide controls replace the stock OSD and drive playback', async ({ page, request }, info) => {
  test.skip(info.project.name === 'phone', 'desktop controls');
  const id = await firstEpisode(request);
  await login(page);
  await startPlayback(page, id);
  await expect(page.locator('#videoOsdPage.tide-taken .videoOsdBottom')).toHaveCSS('opacity', '0');
  await page.mouse.move(700, 450);
  await expect(page.locator('.tide-pc-ep')).toContainText('S1 · E1');
  await page.locator('.tide-pc-play').click();
  await expect.poll(() => page.evaluate(() => document.querySelector('video')!.paused)).toBe(true);
  const t0 = await page.evaluate(() => document.querySelector('video')!.currentTime);
  await page.locator('.tide-pc-fw').click();
  await expect.poll(() => page.evaluate(() => document.querySelector('video')!.currentTime)).toBeGreaterThan(t0 + 5);
  const track = await page.locator('.tide-pc-track').boundingBox();
  await page.mouse.click(track!.x + track!.width * 0.5, track!.y + track!.height / 2);
  await expect.poll(async () => page.evaluate(() => { const v = document.querySelector('video')!; return v.currentTime / v.duration; })).toBeGreaterThan(0.4);
});

test('controls hide after 3 s and come back on mouse move; paused screen after 4 s', async ({ page, request }, info) => {
  test.skip(info.project.name === 'phone', 'mouse idle');
  const id = await firstEpisode(request);
  await login(page);
  await startPlayback(page, id);
  await page.mouse.move(700, 450);
  await page.waitForTimeout(3600);
  await expect(page.locator('.tide-player.tide-pc-idle')).toHaveCount(1);
  await page.mouse.move(710, 460);
  await expect(page.locator('.tide-player.tide-pc-idle')).toHaveCount(0);
  await page.keyboard.press('k');
  await page.waitForTimeout(4400);
  await expect(page.locator('.tide-player.tide-pz-on')).toHaveCount(1);
  await expect(page.locator('.tide-pz-line')).toContainText('S1 · E1');
});

test('episodes shelf plays another episode; settings lists real streams', async ({ page, request }, info) => {
  test.skip(info.project.name === 'phone', 'desktop');
  const id = await firstEpisode(request);
  await login(page);
  await startPlayback(page, id);
  await page.mouse.move(700, 450);
  await page.keyboard.press('s');
  await expect(page.locator('.tide-pset.open')).toBeVisible();
  await expect(page.locator('.tide-pset [data-kind="audio"]').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('e');
  await expect(page.locator('.tide-pshelf.open [data-id]').nth(1)).toBeVisible();
  await page.locator('.tide-pshelf.open .tide-wide').nth(1).click();
  await expect(page.locator('.tide-pc-ep')).toContainText('E2', { timeout: 60_000 });
});

test('countdown card appears at the credits and starts the next episode', async ({ page, request }, info) => {
  test.skip(info.project.name === 'phone', 'desktop');
  const a = await auth(request);
  const cfgUrl = `/Plugins/${PLUGIN_ID}/Configuration`;
  const original = await (await request.get(cfgUrl, { headers: a.headers })).json();
  await request.post(cfgUrl, { headers: a.headers, data: { ...original, CreditsFallbackSeconds: 10 } });
  try {
    const id = await firstEpisode(request);
    await login(page);
    await startPlayback(page, id);
    await page.evaluate(() => { const v = document.querySelector('video')!; v.currentTime = v.duration - 8; });
    await expect(page.locator('.tide-end.show')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.tide-end-cd')).toContainText('Next episode in');
    await expect(page.locator('.tide-pc-ep')).toContainText('E2', { timeout: 60_000 });
  } finally {
    await request.post(cfgUrl, { headers: (await auth(request)).headers, data: { ...original, CreditsFallbackSeconds: original.CreditsFallbackSeconds ?? 35 } });
  }
});

test('phone: double-tap right seeks forward', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'phone', 'phone only');
  const id = await firstEpisode(request);
  await login(page);
  await startPlayback(page, id);
  const t0 = await page.evaluate(() => document.querySelector('video')!.currentTime);
  const vp = page.viewportSize()!;
  await page.touchscreen.tap(vp.width * 0.85, vp.height / 2);
  await page.touchscreen.tap(vp.width * 0.85, vp.height / 2);
  await expect.poll(() => page.evaluate(() => document.querySelector('video')!.currentTime)).toBeGreaterThan(t0 + 5);
});

test('enablePlayer=false keeps the stock OSD', async ({ page, request }) => {
  const a = await auth(request);
  const cfgUrl = `/Plugins/${PLUGIN_ID}/Configuration`;
  const original = await (await request.get(cfgUrl, { headers: a.headers })).json();
  await request.post(cfgUrl, { headers: a.headers, data: { ...original, EnablePlayer: false } });
  try {
    const id = await firstEpisode(request);
    await login(page);
    await page.goto(`/web/#/details?id=${id}`);
    await page.locator('#itemDetailPage:not(.hide) .tide-dh-primary').click();
    await page.waitForSelector('#videoOsdPage:not(.hide)', { timeout: 60_000 });
    await page.waitForTimeout(1500);
    await expect(page.locator('.tide-player')).toHaveCount(0);
  } finally {
    await request.post(cfgUrl, { headers: (await auth(request)).headers, data: { ...original, EnablePlayer: true } });
  }
});

test('episode detail page renders for an Episode id', async ({ page, request }) => {
  const id = await firstEpisode(request);
  await login(page);
  await page.goto(`/web/#/details?id=${id}`);
  await expect(page.locator('#itemDetailPage:not(.hide) .tide-dh-kick')).toContainText('SEASON 1 · EPISODE 1');
  await expect(page.locator('.tide-dh-back')).toBeVisible();
  await expect(page.locator('[data-id] .tide-wide-tag', { hasText: 'NOW VIEWING' })).toBeVisible();
});
