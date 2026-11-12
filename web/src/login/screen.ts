import './login.css';
import { h, icon } from '../ui/dom';
import { posterUrl, userImageUrl, type LoginConfig, type PublicUser } from './api';
import type { PendingSwitch } from './pending';

export type StockApi = typeof import('./stockLogin');
export type LoginState = 'profiles' | 'password' | 'manual' | 'qc' | 'forgot' | 'pin' | 'switching';
export interface LoginDeps { config: LoginConfig; users: PublicUser[]; quickConnect: boolean; stock: StockApi; pending: PendingSwitch | null }
export interface LoginScreen { el: HTMLElement; state(): LoginState; route(hash: string): void; destroy(): void }

const PALETTE = ['#3a3a3c', '#2c3e50', '#3d2c4e', '#4a3b2a', '#23423a', '#4a2a33', '#2a3a4a'];
export function avatarColor(name: string): string {
  let n = 0;
  for (const c of name) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[n % PALETTE.length]!;
}
export function avatar(u: Pick<PublicUser, 'Id' | 'Name' | 'PrimaryImageTag'>, size: number): HTMLElement {
  const el = h('span', { class: 'tide-lg-av', 'aria-hidden': 'true' }, (u.Name.trim()[0] ?? '?').toUpperCase());
  el.style.cssText = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px;background-color:${avatarColor(u.Name)}`;
  const url = userImageUrl(u, size * 2);
  if (url) { el.style.backgroundImage = `url("${url}")`; el.textContent = ''; }
  return el;
}

export interface CredentialsOpts {
  /** Fixed user (password step) or null (asks for the user name too). */
  user: string | null;
  remember: boolean;
  submitLabel?: string;
  /** Resolve null on success (the page moves on) or an error message to show. */
  onSubmit(name: string, password: string, remember: boolean): Promise<string | null>;
  onForgot?(name: string): void;
}

const field = (input: HTMLElement, iconName: string, extra: HTMLElement | null = null) =>
  h('label', { class: 'tide-lg-field' }, icon(iconName), input, extra);

export function credentialsForm(o: CredentialsOpts): HTMLFormElement {
  const name = o.user === null
    ? h('input', { name: 'username', type: 'text', autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false', placeholder: 'User name', 'aria-label': 'User name' }) as HTMLInputElement
    : null;
  const pw = h('input', { name: 'password', type: 'password', autocomplete: 'current-password', placeholder: 'Password', 'aria-label': 'Password' }) as HTMLInputElement;
  const eye = h('button', { class: 'tide-lg-eye', type: 'button', 'aria-label': 'Show password' }, icon('visibility'));
  eye.addEventListener('click', () => {
    pw.type = pw.type === 'password' ? 'text' : 'password';
    eye.replaceChildren(icon(pw.type === 'password' ? 'visibility' : 'visibility_off'));
    pw.focus();
  });
  const err = h('div', { class: 'tide-lg-err', role: 'alert', hidden: true });
  const label = o.submitLabel ?? 'Sign in';
  const go = h('button', { class: 'tide-lg-btn w', type: 'submit' }, label) as HTMLButtonElement;
  let remember = o.remember;
  const rem = h('button', { class: `tide-lg-chk${remember ? '' : ' off'}`, type: 'button', role: 'checkbox', 'aria-checked': String(remember) }, h('i', {}, icon('check')), 'Stay signed in');
  rem.addEventListener('click', () => { remember = !remember; rem.classList.toggle('off', !remember); rem.setAttribute('aria-checked', String(remember)); });
  const forgot = o.onForgot ? h('button', { class: 'tide-lg-lnk', type: 'button', 'data-lg': 'forgot' }, 'Forgot password?') : null;
  forgot?.addEventListener('click', () => o.onForgot!(name ? name.value.trim() : o.user ?? ''));
  const form = h('form', { class: 'tide-lg-form', novalidate: true },
    name ? field(name, 'person') : null, field(pw, 'lock', eye), err, go, h('div', { class: 'tide-lg-row' }, rem, forgot)) as HTMLFormElement;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (go.disabled) return;
    const n = name ? name.value.trim() : o.user ?? '';
    if (!n) { name?.focus(); return; }
    go.disabled = true;
    go.replaceChildren(h('span', { class: 'tide-lg-spin', 'aria-label': 'Signing in' }));
    err.hidden = true;
    void o.onSubmit(n, pw.value, remember).then((problem) => {
      go.disabled = false;
      go.replaceChildren(label);
      if (!problem) return;
      err.replaceChildren(icon('error'), problem);
      err.hidden = false;
      form.classList.remove('shake');
      void form.offsetWidth;
      form.classList.add('shake');
      pw.select();
    });
  });
  setTimeout(() => (name ?? pw).focus(), 60);
  return form;
}

const JF_LOGO = '<svg viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="tlg" x1="97" y1="350" x2="440" y2="150" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#aa5cc3"/><stop offset="1" stop-color="#00a4dc"/></linearGradient></defs><path fill="url(#tlg)" d="M256 72c-18 0-74 101-101 155S56 412 69 437s362 25 374 0-60-155-86-210-82-155-101-155zm0 116c12 0 47 66 64 101s39 82 31 98-182 16-190 0 14-63 31-98 51-101 64-101z"/></svg>';
const WALL_COLS = 9;

function wall(config: LoginConfig): HTMLElement {
  const el = h('div', { class: 'tide-lg-wall', 'aria-hidden': 'true' });
  const p = config.posters;
  if (!p.length) return el;
  // Enough tiles for two screens of rows, doubled so the upward drift can loop seamlessly.
  const count = Math.max(WALL_COLS * 8, p.length);
  for (let i = 0; i < count * 2; i++) {
    const t = h('i', {});
    t.style.backgroundImage = `url("${posterUrl(p[i % p.length]!)}")`;
    el.append(t);
  }
  return el;
}

export function createLoginScreen(d: LoginDeps): LoginScreen {
  const card = h('div', { class: 'tide-lg-card', role: 'main' });
  const brand = h('div', { class: 'tide-lg-brand' });
  brand.innerHTML = JF_LOGO;
  brand.append(h('div', {}, d.config.serverName || 'Jellyfin', h('small', {}, 'Jellyfin')));
  const el = h('div', { class: 'tide-lg' }, wall(d.config), h('div', { class: 'tide-lg-shade' }), brand, card);
  let state: LoginState = 'profiles';

  const btn = (cls: string, lg: string, ...kids: (Node | string)[]) =>
    h('button', { class: cls, type: 'button', 'data-lg': lg }, ...kids);
  const back = (text: string, to: () => void) => {
    const b = btn('tide-lg-lnk tide-lg-back', 'back', icon('arrow_back'), text);
    b.addEventListener('click', to);
    return b;
  };
  const footer = () => {
    const nodes: Node[] = [];
    const disc = d.stock.disclaimer();
    if (disc) nodes.push(h('div', { class: 'tide-lg-disc' }, disc));
    if (d.stock.canSelectServer()) {
      const s = btn('tide-lg-lnk', 'server', icon('dns'), 'Change server');
      s.addEventListener('click', () => d.stock.selectServer());
      nodes.push(s);
    }
    return nodes;
  };
  const show = (s: LoginState, ...nodes: (Node | null)[]) => {
    state = s;
    card.dataset.state = s;
    card.replaceChildren(h('div', { class: 'tide-lg-in' }, ...nodes.filter((n): n is Node => !!n)));
  };
  const signIn = (n: string, pw: string, rem: boolean) => d.stock.signIn(n, pw, rem).then((r) => (r.ok ? null : r.error));
  const home = () => (d.users.length ? profiles() : manual());

  function profiles(): void {
    const grid = h('div', { class: 'tide-lg-grid', role: 'list' }, ...d.users.map((u) => {
      const b = h('button', { class: 'tide-lg-person', type: 'button', 'data-user': u.Id, role: 'listitem' }, avatar(u, 80), h('span', {}, u.Name));
      b.addEventListener('click', () => password(u));
      return b;
    }));
    grid.addEventListener('keydown', (e) => {
      const dir = { ArrowRight: 1, ArrowDown: 4, ArrowLeft: -1, ArrowUp: -4 }[e.key];
      if (!dir) return;
      const all = [...grid.querySelectorAll<HTMLElement>('.tide-lg-person')];
      const i = all.indexOf(document.activeElement as HTMLElement);
      const next = all[Math.min(all.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir))];
      if (next) { e.preventDefault(); next.focus(); }
    });
    const other = btn('tide-lg-btn g', 'other', icon('person_add'), 'Other user');
    other.addEventListener('click', () => manual());
    const qc = d.quickConnect ? btn('tide-lg-btn g', 'qc', icon('devices'), 'Quick Connect') : null;
    qc?.addEventListener('click', () => void quickConnect());
    show('profiles', h('h2', {}, 'Who’s watching?'), grid, h('div', { class: 'tide-lg-actions' }, other, qc), ...footer());
  }

  function password(u: PublicUser): void {
    show('password', h('div', { class: 'tide-lg-who' }, avatar(u, 92), h('b', {}, u.Name)),
      credentialsForm({ user: u.Name, remember: true, onSubmit: signIn, onForgot: (n) => forgot(n) }),
      back('Other profiles', () => profiles()), ...footer());
  }

  function manual(): void {
    const qc = d.quickConnect && !d.users.length ? btn('tide-lg-btn g', 'qc', icon('devices'), 'Quick Connect') : null;
    qc?.addEventListener('click', () => void quickConnect());
    show('manual', h('h2', {}, 'Sign in'),
      credentialsForm({ user: null, remember: true, onSubmit: signIn, onForgot: (n) => forgot(n) }),
      qc ? h('div', { class: 'tide-lg-actions' }, qc) : null,
      d.users.length ? back('Profiles', () => profiles()) : null, ...footer());
  }

  async function quickConnect(): Promise<void> {
    show('qc', h('h2', {}, 'Quick Connect'), h('div', { class: 'tide-lg-wait' }, h('span', { class: 'tide-lg-spin' }), 'Getting a code…'));
    const code = await d.stock.startQuickConnect();
    if (state !== 'qc') return;
    const leave = back('Back', () => { d.stock.cancelQuickConnect(); home(); });
    if (!code) {
      show('qc', h('h2', {}, 'Quick Connect'), h('div', { class: 'tide-lg-err' }, icon('error'), 'Quick Connect isn’t available right now.'), leave);
      return;
    }
    show('qc', h('h2', {}, 'Quick Connect'),
      h('p', { class: 'tide-lg-msg' }, 'On a device where you’re signed in, open your profile → ', h('b', {}, 'Quick Connect'), ' and enter this code.'),
      h('div', { class: 'tide-lg-code', 'aria-label': `Code ${code}` }, ...code.split('').map((c) => h('b', {}, c))),
      h('div', { class: 'tide-lg-wait' }, h('span', { class: 'tide-lg-spin' }), 'Waiting for approval…'), leave);
  }

  function forgot(prefill: string): void {
    const nameIn = h('input', { name: 'username', type: 'text', autocomplete: 'username', autocapitalize: 'off', placeholder: 'User name', 'aria-label': 'User name' }) as HTMLInputElement;
    nameIn.value = prefill;
    const err = h('div', { class: 'tide-lg-err', role: 'alert', hidden: true });
    const go = h('button', { class: 'tide-lg-btn w', type: 'submit' }, 'Send') as HTMLButtonElement;
    const form = h('form', { class: 'tide-lg-form', novalidate: true }, field(nameIn, 'person'), err, go) as HTMLFormElement;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!nameIn.value.trim() || go.disabled) return;
      go.disabled = true;
      d.stock.forgotPassword(nameIn.value.trim()).then((r) => {
        if (r.pin) pin(r.message);
        else { d.stock.backToLogin(); show('forgot', h('h2', {}, 'Forgot password'), h('p', { class: 'tide-lg-msg' }, r.message), back('Back to sign in', home)); }
      }, () => { go.disabled = false; err.replaceChildren(icon('error'), 'Couldn’t reach the server. Try again.'); err.hidden = false; });
    });
    show('forgot', h('h2', {}, 'Forgot password'),
      h('p', { class: 'tide-lg-msg' }, 'Enter your user name. Jellyfin writes a PIN file on the server; whoever runs the server can give you the PIN.'),
      form, back('Back to sign in', () => { d.stock.backToLogin(); home(); }));
    setTimeout(() => nameIn.focus(), 60);
  }

  function pin(message: string): void {
    const pinIn = h('input', { name: 'pin', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', placeholder: 'PIN', 'aria-label': 'PIN' }) as HTMLInputElement;
    const err = h('div', { class: 'tide-lg-err', role: 'alert', hidden: true });
    const go = h('button', { class: 'tide-lg-btn w', type: 'submit' }, 'Reset password') as HTMLButtonElement;
    const form = h('form', { class: 'tide-lg-form', novalidate: true }, field(pinIn, 'pin'), err, go) as HTMLFormElement;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!pinIn.value.trim() || go.disabled) return;
      go.disabled = true;
      d.stock.submitPin(pinIn.value.trim()).then((r) => {
        go.disabled = false;
        if (r.done) { show('forgot', h('h2', {}, 'Password reset'), h('p', { class: 'tide-lg-msg' }, r.message || 'Done.'), back('Back to sign in', home)); return; }
        err.replaceChildren(icon('error'), r.message || 'That PIN didn’t work.');
        err.hidden = false;
      }, () => { go.disabled = false; });
    });
    show('pin', h('h2', {}, 'Enter the PIN'), h('p', { class: 'tide-lg-msg' }, message), form,
      back('Back to sign in', () => { d.stock.backToLogin(); home(); }));
    setTimeout(() => pinIn.focus(), 60);
  }

  function switching(p: PendingSwitch): void {
    const u = d.users.find((x) => x.Name.toLowerCase() === p.name.toLowerCase()) ?? { Id: '', Name: p.name };
    show('switching', h('div', { class: 'tide-lg-who' }, avatar(u, 92), h('b', {}, u.Name)),
      h('div', { class: 'tide-lg-wait' }, h('span', { class: 'tide-lg-spin' }), `Signing in as ${u.Name}…`));
    void d.stock.signIn(p.name, p.password, p.remember).then((r) => { if (!r.ok) home(); });
  }

  if (d.pending) switching(d.pending);
  else home();

  return {
    el,
    state: () => state,
    route(hash) {
      // The stock pages can move on by themselves (Quick Connect approved, reset finished): follow them.
      if (/^#\/login/.test(hash) && (state === 'forgot' || state === 'pin') && !card.querySelector('form')) home();
    },
    destroy() {
      if (state === 'qc') d.stock.cancelQuickConnect();
      el.remove();
    },
  };
}
