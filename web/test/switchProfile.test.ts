import { initSwitchProfile, openSwitchOverlay, stockSignOut, verifyPassword, SWITCH_ITEM } from '../src/login/switchProfile';
import { takePendingSwitch } from '../src/login/pending';

const cfg = { enableTheme: true, enableIcons: true, enableHome: true, enableTrailers: false, heroSlotSeconds: 30, newDays: 14, version: 't' } as any;
let stop: (() => void) | null = null;
beforeEach(() => { (window as any).ApiClient = { serverAddress: () => 'http://jf', accessToken: () => 'tok', getCurrentUserId: () => 'me' }; });
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; document.documentElement.className = ''; });
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };

test('verifyPassword uses its own device id and ends that session; 401 = wrong', async () => {
  const calls: [string, RequestInit][] = [];
  const f = vi.fn(async (url: string, init: RequestInit) => {
    calls.push([url, init]);
    if (url.endsWith('/Users/AuthenticateByName')) {
      const body = JSON.parse(String(init.body));
      return body.Pw === 'mila' ? new Response(JSON.stringify({ AccessToken: 'tmp' })) : new Response('', { status: 401 });
    }
    return new Response('', { status: 204 });
  }) as any;
  expect(await verifyPassword('mila', 'nope', f)).toBe('wrong');
  expect(await verifyPassword('mila', 'mila', f)).toBe('ok');
  const auth = String((calls[1]![1].headers as Record<string, string>).Authorization);
  expect(auth).toMatch(/DeviceId="tide-switch-[a-z0-9]+"/);
  expect(calls[2]![0]).toBe('http://jf/Sessions/Logout');
  expect(String((calls[2]![1].headers as Record<string, string>).Authorization)).toContain('Token="tmp"');
  expect(await verifyPassword('mila', 'mila', vi.fn(async () => { throw new Error('offline'); }) as any)).toBe('error');
});

test('injects "Switch profile" after the first user-menu item, once', async () => {
  stop = initSwitchProfile(cfg);
  document.body.insertAdjacentHTML('beforeend', `<div id="app-user-menu"><ul role="menu"><a role="menuitem" class="MuiMenuItem-root x">Profile</a><a role="menuitem" class="MuiMenuItem-root x">Settings</a></ul></div>`);
  await flush();
  const items = [...document.querySelectorAll('#app-user-menu [role="menuitem"]')];
  expect(items[1]!.classList.contains(SWITCH_ITEM)).toBe(true);
  expect(items[1]!.textContent).toContain('Switch profile');
  document.querySelector('#app-user-menu ul')!.append(document.createElement('li'));
  await flush();
  expect(document.querySelectorAll(`.${SWITCH_ITEM}`)).toHaveLength(1);
});
afterEach(() => { stop?.(); stop = null; });

test('overlay: current user marked; wrong password keeps you signed in; right password signs out via the stock menu', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const u = String(url);
    if (u.endsWith('/Users/Public')) return new Response(JSON.stringify([{ Id: 'me', Name: 'tide' }, { Id: 'u1', Name: 'mila' }]));
    if (u.endsWith('/Users/AuthenticateByName')) return JSON.parse(String((init as RequestInit).body)).Pw === 'mila' ? new Response(JSON.stringify({ AccessToken: 'tmp' })) : new Response('', { status: 401 });
    return new Response('', { status: 204 });
  });
  const signedOut = vi.fn();
  document.body.innerHTML = `<header class="MuiAppBar-root"><button aria-controls="app-user-menu" aria-label="User Menu"></button></header>`;
  document.querySelector('[aria-controls="app-user-menu"]')!.addEventListener('click', () => {
    document.body.insertAdjacentHTML('beforeend', `<div id="app-user-menu"><ul role="menu"><li role="menuitem"><svg data-testid="LogoutIcon"></svg>Sign Out</li></ul></div>`);
    document.querySelector('#app-user-menu li')!.addEventListener('click', signedOut);
  });
  const o = openSwitchOverlay();
  await flush();
  expect(o.querySelector('[data-user="me"]')!.classList.contains('cur')).toBe(true);
  (o.querySelector('[data-user="u1"]') as HTMLElement).click();
  const pw = o.querySelector<HTMLInputElement>('input[name="password"]')!;
  pw.value = 'nope';
  o.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
  expect(o.querySelector('.tide-lg-err')!.textContent).toContain('Wrong password');
  expect(signedOut).not.toHaveBeenCalled();
  expect(takePendingSwitch()).toBeNull();
  pw.value = 'mila';
  o.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await flush(); await new Promise((r) => setTimeout(r, 60));
  expect(signedOut).toHaveBeenCalled();
  expect(takePendingSwitch()).toMatchObject({ name: 'mila', password: 'mila', remember: true });
});

test('overlay: picking yourself or Cancel / Esc just closes', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify([{ Id: 'me', Name: 'tide' }])));
  const o = openSwitchOverlay();
  await flush();
  (o.querySelector('[data-user="me"]') as HTMLElement).click();
  expect(o.isConnected).toBe(false);
  const o2 = openSwitchOverlay();
  await flush();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(o2.isConnected).toBe(false);
});

test('stockSignOut gives up cleanly when the menu never opens', async () => {
  expect(await stockSignOut(100)).toBe(false);
  expect(document.documentElement.classList.contains('tide-switching')).toBe(false);
});
