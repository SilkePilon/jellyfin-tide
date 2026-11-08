// Phone hero check: screenshots + overlap/overflow assertions. Usage: node phone-hero-check.mjs
import { chromium } from '@playwright/test';
const BASE = process.env.JF_URL ?? 'http://localhost:8096';
const OUT = process.env.OUT ?? '../.superpowers/sdd/';
const b = await chromium.launch();
const results = [];
async function run(name, viewport, file, phone) {
  const ctx = await b.newContext({ viewport, ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : {}) });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto(BASE + '/web/');
  await p.waitForSelector('input[type=password]', { timeout: 60000 });
  await p.fill('input[type=text], input[name=username], #txtManualName', 'tide');
  await p.fill('input[type=password]', 'tide');
  await p.keyboard.press('Enter');
  await p.waitForSelector('.tide-hero', { timeout: 30000 });
  await p.evaluate(() => { location.hash = '#/home'; });
  await p.waitForTimeout(4000);
  const m = await p.evaluate(() => {
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, bottom: b.bottom, right: b.right }; };
    const slide = document.querySelector('.tide-hero-slide.on');
    const vis = (el) => el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
    const meta = [...slide.querySelectorAll('.tide-hero-meta, .tide-hero-meta-ph')].find(vis);
    const dots = [...document.querySelectorAll('.tide-t3-bar')].map(r);
    const dotItems = [...document.querySelectorAll('.tide-t3-item')].map(r);
    const btns = r(slide.querySelector('.tide-hero-btns'));
    const play = r(slide.querySelector('.tide-btn-w'));
    const firstTitle = r(document.querySelector('.tide-home > .tide-hero ~ .tide-row:not([hidden]) .tide-row-title'));
    const hero = r(document.querySelector('.tide-hero'));
    const txt = r(slide.querySelector('.tide-hero-txt'));
    const mute = document.querySelector('.tide-hero-mute');
    const ib = [...document.querySelectorAll('.MuiAppBar-root .MuiIconButton-root')].map((e) => getComputedStyle(e).backgroundColor);
    return {
      metaClass: meta?.className, metaText: meta?.textContent, metaScroll: meta?.scrollWidth, metaClient: meta?.clientWidth,
      hero, txt, btns, play, firstTitle, dots, dotItems,
      bg: getComputedStyle(slide.querySelector('.tide-hero-bg')).backgroundImage.slice(0, 160),
      bgPos: getComputedStyle(slide.querySelector('.tide-hero-bg')).backgroundPosition,
      muteDisplay: getComputedStyle(mute).display, muteHidden: mute.hidden, playing: document.querySelector('.tide-hero').classList.contains('tide-hero-playing'),
      appbarIconBgs: ib,
    };
  });
  const ov = (a, c) => a && c && a.x < c.right && c.x < a.right && a.y < c.bottom && c.y < a.bottom;
  const dotsBottom = Math.max(...m.dots.map((d) => d.bottom));
  const dotsTop = Math.min(...m.dots.map((d) => d.y));
  const checks = {
    metaNoOverflow: m.metaScroll <= m.metaClient,
    dotsVsButtons: !m.dots.some((d) => ov(d, m.btns)),
    dotsVsTitle: !m.dots.some((d) => ov(d, m.firstTitle)),
    buttonsVsTitle: !ov(m.btns, m.firstTitle),
    gapDotsToTitle: m.firstTitle ? m.firstTitle.y - dotsBottom : null,
    gapButtonsToDots: dotsTop - m.btns.bottom,
    txtEndAboveHeroBottom: m.hero.bottom - m.txt.bottom,
    noPageErrors: errors.length === 0,
  };
  await p.screenshot({ path: OUT + file });
  results.push({ name, viewport, checks, m, errors });
  await ctx.close();
}
await run('phone-390', { width: 390, height: 844 }, 'phone-hero-after.png', true);
await run('phone-360', { width: 360, height: 740 }, 'phone-hero-small.png', true);
await run('desktop-1440', { width: 1440, height: 900 }, 'phone-hero-desktop-check.png', false);
console.log(JSON.stringify(results, null, 1));
await b.close();
// Assertions (same contract as tests/home.spec.ts): fail the run instead of only logging the gaps.
const failures = [];
for (const r of results) {
  const c = r.checks;
  const want = (ok, what) => { if (!ok) failures.push(`${r.name}: ${what}`); };
  want(c.noPageErrors, 'page errors');
  if (r.name.startsWith('phone')) {
    want(c.metaNoOverflow, 'meta overflows');
    want(c.dotsVsButtons && c.dotsVsTitle && c.buttonsVsTitle, 'dots/buttons/title overlap');
    want(c.gapDotsToTitle !== null && c.gapDotsToTitle >= 8, `dots→row title gap ${c.gapDotsToTitle} < 8`);
    want(c.gapButtonsToDots >= 0, `buttons→dots gap ${c.gapButtonsToDots} < 0`);
    want(c.txtEndAboveHeroBottom >= 44, `text ends ${c.txtEndAboveHeroBottom}px above hero bottom (< 44)`);
    want(Math.min(...r.m.dotItems.map((d) => d.w)) >= 44, 'dot hit area narrower than 44px');
  }
}
if (failures.length) {
  console.error('FAIL\n' + failures.join('\n'));
  process.exit(1);
}
console.log('OK');
