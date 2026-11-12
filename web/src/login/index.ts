import { hold, release } from '../boot/cloak';
import { invalidate } from '../api/cache';
import { onLocationChange } from '../router/location';
import { fetchLoginConfig, publicUsers, quickConnectEnabled, type LoginConfig, type PublicUser } from './api';
import { createLoginScreen, type LoginScreen } from './screen';
import { takePendingSwitch } from './pending';
import * as stock from './stockLogin';

export const LOGIN_ROUTE = /^#\/(login|forgotpassword|forgotpasswordpin)(\?|$)/;
export const isLoginRoute = (hash: string = location.hash): boolean => LOGIN_ROUTE.test(hash);
const HINT = 'tide:login';
const hinted = () => { try { return localStorage.getItem(HINT) !== '0'; } catch { return true; } };
const saveHint = (on: boolean) => { try { localStorage.setItem(HINT, on ? '1' : '0'); } catch { /* storage blocked */ } };

export interface LoginBootDeps { config(): Promise<LoginConfig | null>; users(): Promise<PublicUser[]>; quickConnect(): Promise<boolean> }

/** Runs from script start (before any session): Tide's sign-in screen over the stock pages, only on their routes. */
export function initLogin(deps: LoginBootDeps = { config: fetchLoginConfig, users: publicUsers, quickConnect: quickConnectEnabled }): () => void {
  let screen: LoginScreen | null = null;
  let mounting = false;
  let cfg: Promise<LoginConfig | null> | null = null;

  const unmount = () => {
    if (!screen) return;
    screen.destroy();
    screen = null;
    document.documentElement.classList.remove('tide-login');
    invalidate(); // a different user may sign in without a page reload: drop the last one's cached rows
  };
  const sync = async () => {
    if (!isLoginRoute()) { unmount(); release('login'); return; }
    if (screen) { screen.route(location.hash); return; }
    if (mounting) return;
    mounting = true;
    try {
      if (hinted()) hold('login');
      const c = await (cfg ??= deps.config());
      if (!c) cfg = null; // unreachable: try again next time
      saveHint(!!c?.enabled);
      if (!c?.enabled || !isLoginRoute()) return;
      const [users, qc] = await Promise.all([deps.users(), deps.quickConnect()]);
      if (!isLoginRoute() || screen) return;
      screen = createLoginScreen({ config: c, users, quickConnect: qc, stock, pending: takePendingSwitch() });
      document.body.append(screen.el);
      document.documentElement.classList.add('tide-login');
    } finally {
      mounting = false;
      release('login');
    }
  };
  const stop = onLocationChange(() => void sync());
  void sync();
  return () => { stop(); unmount(); };
}
