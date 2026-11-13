import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import { login } from './auth';

const CLIENT = 'MediaBrowser Client="e2e", Device="e2e", DeviceId="e2e", Version="1"';
const PLUGIN_ID = '7c1d3e5a-9b2f-4c6d-8e0a-1f3b5d7e9a2c';
test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

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

test('one skip button: Tide\'s pill names each segment and Jellyfin\'s own skip button stays hidden', async ({ page, request }, info) => {
  test.skip(info.project.name === 'phone', 'desktop controls');
  const id = await firstEpisode(request);
  // Like a server with Intro Skipper: a recap from the start, then the intro. Jellyfin's player reads the same list.
  await page.route('**/MediaSegments/**', (r) => r.fulfill({ json: { Items: [
    { Id: 'a', ItemId: id, Type: 'Recap', StartTicks: 0, EndTicks: 8e7 },
    { Id: 'b', ItemId: id, Type: 'Intro', StartTicks: 8e7, EndTicks: 20e7 }], TotalRecordCount: 2, StartIndex: 0 } }));
  // Jellyfin's player only asks for segments when the server says the media has some.
  await page.route('**/Items/*/PlaybackInfo**', async (r) => {
    const res = await r.fetch();
    const j = await res.json();
    for (const m of j.MediaSources ?? []) m.HasSegments = true;
    await r.fulfill({ response: res, json: j });
  });
  await login(page);
  await startPlayback(page, id);
  const pill = page.locator('.tide-pc-skip.show');
  await expect(pill).toContainText('Skip recap');
  await pill.locator('button').click();
  await expect(pill).toContainText('Skip intro', { timeout: 15_000 });
  // Jellyfin asks to skip intros by default, so it has made its own button by now; it never shows.
  await expect(page.locator('.skip-button-container .skip-button')).toHaveCount(1);
  await expect(page.locator('.skip-button-container')).toBeHidden();
  await pill.locator('button').click();
  await expect.poll(() => page.evaluate(() => document.querySelector('video')!.currentTime)).toBeGreaterThan(19);
  await expect(page.locator('.tide-pc-skip.show')).toHaveCount(0);
  await expect(page.locator('.skip-button-container')).toBeHidden();
});

test('controls hide after 3 s and come back on mouse move; paused screen after 3 s', async ({ page, request }, info) => {
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
  await expect(page.locator('.tide-pmset.open')).toBeVisible();
  await expect(page.locator('.tide-pmset [data-go="audio"]')).toBeVisible();
  await expect(page.locator('.tide-pmset [data-go="playbackrate"]')).toBeVisible();
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
    // The ring fills every frame, not in steps at each position update.
    const fill = await page.evaluate(async () => {
      const arc = document.querySelector('.tide-end.show .tide-end-ar')!;
      const out: number[] = [];
      for (let i = 0; i < 12; i++) { out.push(parseFloat(getComputedStyle(arc).strokeDashoffset)); await new Promise((r) => setTimeout(r, 50)); }
      return out;
    });
    expect(new Set(fill).size).toBeGreaterThanOrEqual(10);
    expect(fill[fill.length - 1]).toBeLessThan(fill[0]);
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

test('shelf keeps full-size cards in long seasons; back button leaves the player', async ({ page, request }, info) => {
  test.skip(info.project.name === 'phone', 'desktop');
  const id = await firstEpisode(request);
  await login(page);
  await startPlayback(page, id);
  await page.mouse.move(700, 450);
  await page.keyboard.press('e');
  await expect(page.locator('.tide-pshelf.open .tide-wide').first()).toBeVisible();
  // Simulate a 22-episode season: the cards must not shrink to fit.
  await page.evaluate(() => { const t = document.querySelector('.tide-pshelf .tide-row-track')!; const c = t.firstElementChild!; for (let i = 0; i < 20; i++) t.append(c.cloneNode(true)); });
  const w = await page.locator('.tide-pshelf .tide-wide').first().evaluate((e) => e.getBoundingClientRect().width);
  expect(w).toBeGreaterThan(300);
  await page.keyboard.press('Escape');
  await page.mouse.move(705, 455);
  await page.locator('.tide-pc-back').click();
  await expect(page).toHaveURL(/#\/details\?id=/);
  await expect(page.locator('.tide-player')).toHaveCount(0);
});

test('movies: no Episodes or Next episode buttons in the player', async ({ page, request }, info) => {
  test.skip(info.project.name === 'phone', 'desktop');
  const a = await auth(request);
  const r = await request.get(`/Items?userId=${a.userId}&Recursive=true&IncludeItemTypes=Movie&SearchTerm=Sintel`, { headers: a.headers });
  const id = (await r.json()).Items[0].Id as string;
  await login(page);
  await startPlayback(page, id);
  await page.mouse.move(700, 450);
  await expect(page.locator('.tide-pc-play')).toBeVisible();
  await expect(page.locator('.tide-pc-epbtn')).toBeHidden();
  await expect(page.locator('.tide-pc-next')).toBeHidden();
});

test('settings menu drives the default player: speed, aspect ratio, playback info; stock sheets stay hidden', async ({ page, request }, info) => {
  test.skip(info.project.name === 'phone', 'desktop');
  const id = await firstEpisode(request);
  await login(page);
  await startPlayback(page, id);
  await page.mouse.move(700, 450);
  await page.locator('.tide-pc-set').click();
  await expect(page.locator('.tide-pmset.open [data-go="playbackrate"]')).toBeVisible();
  await expect(page.locator('.tide-pmset [data-go="suboffset"]')).toHaveCount(0);
  const visibleSheet = () => page.evaluate(() => [...document.querySelectorAll('.actionSheet')].some((s) => getComputedStyle(s.closest('.dialogContainer') ?? s).opacity !== '0'));
  await page.locator('.tide-pmset [data-go="playbackrate"]').click();
  expect(await visibleSheet()).toBe(false);
  await page.locator('.tide-pmset-sub [data-pick="1.5"]').click();
  await expect.poll(() => page.evaluate(() => document.querySelector('video')!.playbackRate)).toBe(1.5);
  await expect(page.locator('.tide-pmset [data-go="playbackrate"] .tide-pm-val')).toHaveText('1.5x');
  await page.locator('.tide-pmset [data-go="aspectratio"]').click();
  await page.locator('.tide-pmset-sub [data-pick="cover"]').click();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('video')!).objectFit)).toBe('cover');
  await page.locator('.tide-pmset [data-toggle="stats"]').click();
  await expect(page.locator('.playerStats:not(.hide)')).toBeVisible();
  expect(page.url()).toContain('#/video');
  await expect(page.locator('.actionSheet.opened')).toHaveCount(0);
});

test('subtitles menu: filter, pick, Timing drives the stock offset', async ({ page, request }, info) => {
  test.skip(info.project.name === 'phone', 'desktop');
  const id = await firstEpisode(request);
  await login(page);
  await startPlayback(page, id);
  await page.mouse.move(700, 450);
  await page.keyboard.press('c');
  const menu = page.locator('.tide-pmsub.open');
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-sub]').nth(1)).toBeVisible();
  await menu.locator('input').fill('zzz');
  await expect(menu.locator('.tide-pm-empty')).toContainText('zzz');
  await menu.locator('input').fill('');
  await menu.locator('[data-sub]').nth(1).click();
  await expect(menu.locator('[data-sub]').nth(1)).toHaveClass(/\bon\b/);
  await menu.locator('[data-sync="1"]').click();
  await expect.poll(() => page.evaluate(() => (document.querySelector('.subtitleSyncSlider') as HTMLInputElement | null)?.value)).toBe('0.1');
  await expect(menu.locator('output')).toHaveText('+0.1 s');
  await expect(page.locator('.actionSheet.opened')).toHaveCount(0);
});
