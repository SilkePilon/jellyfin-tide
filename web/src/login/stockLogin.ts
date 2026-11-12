/**
 * Drives the stock 12.4 sign-in pages (which stay in the DOM, hidden under Tide's login screen). jellyfin-web keeps
 * doing the real work: credentials, server selection, Quick Connect polling, password reset.
 * Probed markup: docs/superpowers/plans/2026-11-12-tide-login.md (Global Constraints).
 */
export const LOGIN_TIMEOUT_MS = 15_000;
export type SignInResult = { ok: true } | { ok: false; error: string };

const visible = (sel: string) => document.querySelector<HTMLElement>(`${sel}:not(.hide)`);
export const loginPage = (): HTMLElement | null => visible('#loginPage');
const onLogin = () => /^#\/login(\?|$)/.test(location.hash);

function waitFor<T>(find: () => T | null | undefined | false, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      const v = find();
      if (v) { resolve(v); return; }
      if (Date.now() - t0 > ms) { reject(new Error('stock login timeout')); return; }
      setTimeout(tick, 25);
    };
    tick();
  });
}

const setValue = (el: HTMLInputElement | null, v: string) => {
  if (!el) return;
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
};
const submit = (form: HTMLFormElement) => {
  if (typeof form.requestSubmit === 'function') form.requestSubmit();
  else form.querySelector<HTMLElement>('[type="submit"]')?.click();
};

export function newestDialog(): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>('.dialogContainer .dialog');
  return all[all.length - 1] ?? null;
}
export function dialogMessage(d: Element): string {
  const body = d.querySelector('.formDialogContent') ?? d.querySelector('.text') ?? d;
  return (body.textContent ?? '').replace(/\s+/g, ' ').trim();
}
const newDialog = (before: Element | null) => () => { const d = newestDialog(); return d && d !== before ? d : null; };

export async function signIn(name: string, password: string, remember: boolean, timeoutMs = LOGIN_TIMEOUT_MS): Promise<SignInResult> {
  const page = await waitFor(loginPage, 5000).catch(() => null);
  const form = page?.querySelector<HTMLFormElement>('form.manualLoginForm');
  if (!page || !form) return { ok: false, error: 'The sign-in page isn’t ready. Try again.' };
  setValue(page.querySelector('#txtManualName'), name);
  setValue(page.querySelector('#txtManualPassword'), password);
  const rem = page.querySelector<HTMLInputElement>('.chkRememberLogin');
  if (rem && rem.checked !== remember) rem.click();
  const before = new Set(document.querySelectorAll('.toast'));
  submit(form);
  try {
    return await waitFor<SignInResult>(() => {
      if (!onLogin()) return { ok: true };
      const t = [...document.querySelectorAll<HTMLElement>('.toast.toastVisible')].find((x) => !before.has(x) && x.textContent?.trim());
      return t ? { ok: false, error: t.textContent!.trim() } : null;
    }, timeoutMs);
  } catch {
    return { ok: false, error: 'Couldn’t reach the server. Try again.' };
  }
}

export async function startQuickConnect(timeoutMs = 4000): Promise<string | null> {
  loginPage()?.querySelector<HTMLElement>('.btnQuick')?.click();
  const dlg = await waitFor(() => document.querySelector('#quickConnectAlert'), timeoutMs).catch(() => null);
  return dlg?.textContent?.match(/\b(\d{6})\b/)?.[1] ?? null;
}

/** Close the stock Quick Connect dialog through the history entry it added (never leaves the login page). */
export function cancelQuickConnect(): void {
  const usr = (history.state as { usr?: { dialogs?: unknown[] } | null } | null)?.usr;
  if (document.querySelector('#quickConnectAlert') && usr?.dialogs?.length) history.back();
}

export async function forgotPassword(name: string, timeoutMs = 8000): Promise<{ message: string; pin: boolean }> {
  loginPage()?.querySelector<HTMLElement>('.btnForgotPassword')?.click();
  const page = await waitFor(() => visible('#forgotPasswordPage'), 3000);
  setValue(page.querySelector('#txtName'), name);
  const before = newestDialog();
  const form = page.querySelector<HTMLFormElement>('form');
  if (form) submit(form);
  const dlg = await waitFor(newDialog(before), timeoutMs);
  const message = dialogMessage(dlg);
  dlg.querySelector<HTMLElement>('button')?.click();
  return { message, pin: /\bPIN\b/.test(message) };
}

export async function submitPin(pin: string, timeoutMs = 8000): Promise<{ message: string; done: boolean }> {
  const page = await waitFor(() => visible('.forgotPasswordPinPage'), 3000);
  setValue(page.querySelector('#txtPin'), pin);
  const before = newestDialog();
  const form = page.querySelector<HTMLFormElement>('form');
  if (form) submit(form);
  const dlg = await waitFor(newDialog(before), timeoutMs).catch(() => null);
  const message = dlg ? dialogMessage(dlg) : '';
  dlg?.querySelector<HTMLElement>('button')?.click();
  await new Promise((r) => setTimeout(r, 300));
  return { message, done: onLogin() };
}

export function backToLogin(): void {
  if (!onLogin()) location.hash = '#/login';
}

export const disclaimer = (): string => (loginPage()?.querySelector('.loginDisclaimer')?.textContent ?? '').trim();
export const canSelectServer = (): boolean => !!loginPage()?.querySelector('.btnSelectServer:not(.hide)');
export const selectServer = (): void => { loginPage()?.querySelector<HTMLElement>('.btnSelectServer')?.click(); };
