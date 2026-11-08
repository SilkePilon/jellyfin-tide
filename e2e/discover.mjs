// Logs in and records the Modern-layout DOM facts Tide depends on. Output -> docs/notes/web-12.4-dom.md (paste).
import { chromium } from '@playwright/test';
const BASE = process.env.JF_URL ?? 'http://localhost:8096';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(BASE + '/web/');
await p.waitForSelector('input[type=password]', { timeout: 30000 });
await p.fill('input[type=text], input[name=username], #txtManualName', 'tide');
await p.fill('input[type=password]', 'tide');
await p.keyboard.press('Enter');
await p.waitForTimeout(6000);
const facts = await p.evaluate(() => {
  const q = (s) => !!document.querySelector(s);
  const cls = (el) => el ? `${el.tagName.toLowerCase()}#${el.id}.${[...el.classList].join('.')}` : null;
  const main = document.querySelector('main') || document.querySelector('[role=main]');
  return {
    url: location.href,
    hasApiClient: typeof window.ApiClient,
    apiClientFns: window.ApiClient ? ['serverAddress', 'accessToken', 'getCurrentUserId', 'serverId'].map((f) => `${f}:${typeof window.ApiClient[f]}`) : [],
    globals: ['playbackManager', 'Emby', 'appRouter', 'Dashboard'].map((g) => `${g}:${typeof window[g]}`),
    appBar: cls(document.querySelector('.MuiAppBar-root')),
    skinHeader: q('.skinHeader'),
    main: cls(main),
    homeCandidates: ['#indexPage', '.homePage', '[data-testid=home]', '.homeSectionsContainer', '.sections'].map((s) => `${s}:${q(s)}`),
    mainChildren: main ? [...main.children].map(cls) : [],
    muiIconTestIds: [...new Set([...document.querySelectorAll('svg[data-testid]')].map((s) => s.getAttribute('data-testid')))],
    hashRouting: location.hash.startsWith('#/'),
    // Walk up from the first home section to <main>: the stable container wrapping stock home content.
    homeAncestry: (() => {
      const out = []; let el = document.querySelector('.homeSectionsContainer .section0, .homeSectionsContainer > *');
      while (el && el !== document.body) { out.push(cls(el)); if (el.tagName === 'MAIN') break; el = el.parentElement; }
      return out;
    })(),
    indexPageChildren: [...(document.querySelector('#indexPage')?.children ?? [])].map(cls),
    mainAnimatedPagesChildren: [...(document.querySelector('.mainAnimatedPages')?.children ?? [])].map(cls),
    appBarInsideMain: !!(main && main.querySelector('.MuiAppBar-root')),
    appBarInsideIndexPage: !!document.querySelector('#indexPage .MuiAppBar-root, #indexPage .skinHeader'),
    fontIcons: [...new Set([...document.querySelectorAll('.material-icons, span.material-icons')].map((s) => s.textContent.trim() || [...s.classList].join('.')))],
  };
});
await p.screenshot({ path: 'discover-home.png', fullPage: true });
// After navigating away, does #indexPage stay in the DOM (page cache) and get hidden?
await p.goto(BASE + '/web/#/movies'); await p.waitForTimeout(3000);
const afterNav = await p.evaluate(() => {
  const ip = document.querySelector('#indexPage');
  return { url: location.href, indexPagePresent: !!ip, indexPageHidden: ip ? ip.classList.contains('hide') || getComputedStyle(ip).display === 'none' : null,
    mainAnimatedPagesChildren: [...(document.querySelector('.mainAnimatedPages')?.children ?? [])].map((el) => `${el.tagName.toLowerCase()}#${el.id}.${[...el.classList].join('.')}`) };
});
console.log(JSON.stringify({ ...facts, afterNavToMovies: afterNav }, null, 2));
await b.close();
