// Screenshots of the v2 home for visual review. Usage: node v2-shots.mjs <outdir>
import { chromium } from '@playwright/test';
const out = process.argv[2];
const BASE = process.env.JF_URL ?? 'http://localhost:8096';
const b = await chromium.launch();
async function login(p) {
  await p.goto(BASE + '/web/'); await p.waitForSelector('input[type=password]');
  await p.fill('input[type=text], #txtManualName', 'tide'); await p.fill('input[type=password]', 'tide'); await p.keyboard.press('Enter');
  await p.waitForSelector('.tide-home', { timeout: 30000 }); await p.waitForTimeout(2500);
}
const errors = [];
for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['wide', { width: 1920, height: 1080 }], ['narrow', { width: 1100, height: 800 }], ['phone', { width: 390, height: 844 }]]) {
  const ctx = await b.newContext({ viewport: vp, ...(name === 'phone' ? { isMobile: true, hasTouch: true } : {}) });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await login(p);
  // A third-party plugin button in the bar must look like the stock ones.
  await p.evaluate(() => { const box = document.querySelector('.MuiAppBar-root .MuiToolbar-root > div:last-child'); if (box) { const btn = document.createElement('button'); btn.className = 'plugin-dice'; btn.innerHTML = '<span class="material-icons">casino</span>'; box.prepend(btn); } });
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/${name}-top.png` });
  if (name === 'desktop') {
    const card = p.locator('.tide-wide').first();
    if (await card.count()) { await card.scrollIntoViewIfNeeded(); await card.hover(); await p.waitForTimeout(700); await p.screenshot({ path: `${out}/desktop-hover.png` }); }
    await p.mouse.move(5, 5);
    await p.evaluate(() => window.scrollTo(0, 900)); await p.waitForTimeout(900);
    await p.screenshot({ path: `${out}/desktop-scrolled.png` });
    const metrics = await p.evaluate(() => {
      const bar = document.querySelector('.MuiAppBar-root'); const btns = [...document.querySelectorAll('.MuiAppBar-root .MuiIconButton-root, .MuiAppBar-root .plugin-dice')].map((x) => { const r = x.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; });
      const tb = document.querySelector('.MuiAppBar-root .MuiToolbar-root').getBoundingClientRect();
      const hero = document.querySelector('.tide-hero')?.getBoundingClientRect();
      const card = document.querySelector('.tide-wide')?.getBoundingClientRect();
      return { toolbarTop: Math.round(tb.top + scrollY), btns, heroH: hero && Math.round(hero.height), vh: innerHeight, cardW: card && Math.round(card.width) };
    });
    console.log('desktop metrics', JSON.stringify(metrics));
  }
  if (name !== 'phone') {
    const w = await p.evaluate(() => Math.round(document.querySelector('.tide-wide')?.getBoundingClientRect().width ?? 0));
    console.log(name, 'card width', w, 'viewport', vp.width);
  }
  if (name === 'phone') { await p.evaluate(() => window.scrollTo(0, 700)); await p.waitForTimeout(700); await p.screenshot({ path: `${out}/phone-rows.png` }); }
  await ctx.close();
}
console.log('errors', JSON.stringify(errors));
await b.close();
