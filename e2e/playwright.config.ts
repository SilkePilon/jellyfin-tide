import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  workers: 1, // tests mutate shared server state (plugin config, user prefs)
  // A fixed locale: without LANG, headless Chromium reports one that makes jellyfin-web's toLocaleString throw, and its
  // video page then bounces back home.
  use: { baseURL: process.env.JF_URL ?? 'http://localhost:8096', trace: 'retain-on-failure', locale: 'en-US' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
});
