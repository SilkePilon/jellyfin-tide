import { getSession, serverBase } from '../api/client';
import { h, icon } from '../ui/dom';
import { avatar, credentialsForm } from './screen';
import { setPendingSwitch, takePendingSwitch } from './pending';
import type { PublicUser } from './api';
import type { ClientConfig } from '../types';

export const SWITCH_ITEM = 'tide-switch-item';

/**
 * Check a password without touching the current session: a one-time device id (re-authenticating with this device's
 * own id would revoke its token), then end that verification session at once.
 */
export async function verifyPassword(name: string, password: string, f: typeof fetch = fetch): Promise<'ok' | 'wrong' | 'error'> {
  const device = `tide-switch-${Math.random().toString(36).slice(2, 10)}`;
  const auth = `MediaBrowser Client="Tide", Device="Tide profile switch", DeviceId="${device}", Version="1"`;
  try {
    const r = await f(`${serverBase()}/Users/AuthenticateByName`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth }, body: JSON.stringify({ Username: name, Pw: password }),
    });
    if (r.status === 401 || r.status === 403) return 'wrong';
    if (!r.ok) return 'error';
    const j = (await r.json()) as { AccessToken?: string };
    if (j.AccessToken) await f(`${serverBase()}/Sessions/Logout`, { method: 'POST', headers: { Authorization: `${auth}, Token="${j.AccessToken}"` } }).catch(() => undefined);
    return 'ok';
  } catch {
    return 'error';
  }
}

function waitFor<T>(find: () => T | null | undefined, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => { const v = find(); if (v) resolve(v); else if (Date.now() - t0 > ms) reject(new Error('timeout')); else setTimeout(tick, 25); };
    tick();
  });
}

/** Sign out the way the stock UI does (its user menu's Sign Out), with the menu hidden while Tide clicks it. */
export async function stockSignOut(timeoutMs = 3000): Promise<boolean> {
  const html = document.documentElement;
  html.classList.add('tide-switching');
  try {
    document.querySelector<HTMLElement>('.MuiAppBar-root button[aria-controls="app-user-menu"], .MuiAppBar-root button[aria-label="User Menu"]')?.click();
    const out = await waitFor(() => document.querySelector('#app-user-menu [data-testid="LogoutIcon"]')?.closest<HTMLElement>('li, [role="menuitem"]'), timeoutMs);
    out.click();
    // Keep the stock menu hidden while it closes behind the sign-out.
    setTimeout(() => html.classList.remove('tide-switching'), 800);
    return true;
  } catch {
    html.classList.remove('tide-switching');
    return false;
  }
}

async function users(): Promise<PublicUser[]> {
  try { const r = await fetch(`${serverBase()}/Users/Public`); return r.ok ? ((await r.json()) as PublicUser[]) : []; } catch { return []; }
}

export function openSwitchOverlay(): HTMLElement {
  const me = getSession()?.userId ?? '';
  const box = h('div', { class: 'tide-sw-in' }, h('div', { class: 'tide-lg-wait' }, h('span', { class: 'tide-lg-spin' })));
  const el = h('div', { class: 'tide-sw tide-lg-font', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Switch profile' }, box);
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  const cancel = () => { const b = h('button', { class: 'tide-lg-lnk', type: 'button', 'data-lg': 'close' }, icon('close'), 'Cancel'); b.addEventListener('click', close); return b; };
  const submit = async (name: string, password: string, remember: boolean): Promise<string | null> => {
    const v = await verifyPassword(name, password);
    if (v === 'wrong') return 'Wrong password. Try again.';
    if (v === 'error') return 'Couldn’t reach the server. Try again.';
    setPendingSwitch({ name, password, remember });
    if (!(await stockSignOut())) { takePendingSwitch(); return 'Couldn’t sign out. Try again.'; }
    return null;
  };
  const ask = (u: PublicUser | null) => {
    box.replaceChildren(h('div', { class: 'tide-sw-card' },
      u ? h('div', { class: 'tide-lg-who' }, avatar(u, 92), h('b', {}, u.Name)) : h('h2', {}, 'Other user'),
      credentialsForm({ user: u ? u.Name : null, remember: true, submitLabel: u ? `Switch to ${u.Name}` : 'Switch', onSubmit: submit }),
      cancel()));
  };
  void users().then((list) => {
    if (!el.isConnected) return;
    if (!list.length) { ask(null); return; }
    const people = h('div', { class: 'tide-sw-people' }, ...list.map((u) => {
      const b = h('button', { class: `tide-sw-person${u.Id === me ? ' cur' : ''}`, type: 'button', 'data-user': u.Id }, avatar(u, 110), h('span', {}, u.Name), u.Id === me ? h('small', {}, 'CURRENT') : null);
      b.addEventListener('click', () => (u.Id === me ? close() : ask(u)));
      return b;
    }));
    const other = h('button', { class: 'tide-sw-person', type: 'button', 'data-lg': 'other' }, h('span', { class: 'tide-lg-av tide-sw-add' }, icon('add')), h('span', {}, 'Other user'));
    other.addEventListener('click', () => ask(null));
    people.append(other);
    box.replaceChildren(h('h2', {}, 'Switch profile'), people, cancel());
  });
  document.body.append(el);
  return el;
}

function injectItem(): void {
  const menu = document.querySelector<HTMLElement>('#app-user-menu [role="menu"]');
  if (!menu || menu.querySelector(`.${SWITCH_ITEM}`)) return;
  const first = menu.querySelector<HTMLElement>('[role="menuitem"]');
  if (!first) return;
  const item = document.createElement('li');
  item.className = `${first.className} ${SWITCH_ITEM}`;
  item.setAttribute('role', 'menuitem');
  item.tabIndex = -1;
  item.append(
    h('div', { class: 'MuiListItemIcon-root' }, icon('switch_account')),
    h('div', { class: 'MuiListItemText-root' }, h('span', { class: 'MuiTypography-root MuiTypography-body1 MuiListItemText-primary' }, 'Switch profile')));
  item.addEventListener('click', () => {
    // Close the MUI menu (Escape on its list), then open the overlay.
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.querySelector<HTMLElement>('#app-user-menu .MuiBackdrop-root')?.click();
    openSwitchOverlay();
  });
  first.after(item);
}

export function initSwitchProfile(cfg: ClientConfig): () => void {
  if (cfg.enableLogin === false) return () => {};
  let queued = false;
  const obs = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; injectItem(); });
  });
  obs.observe(document.body, { childList: true, subtree: true });
  injectItem();
  return () => obs.disconnect();
}
