import { initLogin, isLoginRoute } from '../src/login/index';
import { setPendingSwitch } from '../src/login/pending';

const CFG = { enabled: true, serverName: 'Home Media', posters: [] };
const deps = (enabled = true) => ({ config: vi.fn(async () => (enabled ? CFG : { ...CFG, enabled: false })), users: vi.fn(async () => [{ Id: 'u1', Name: 'mila' }]), quickConnect: vi.fn(async () => false) });
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
let stop: (() => void) | null = null;
beforeEach(() => { (window as any).ApiClient = { serverAddress: () => 'http://jf' }; document.body.innerHTML = '<div id="loginPage" class="page"></div>'; });
afterEach(() => { stop?.(); stop = null; location.hash = ''; document.documentElement.className = ''; document.body.innerHTML = ''; });

test('isLoginRoute', () => {
  expect(isLoginRoute('#/login?serverid=x')).toBe(true);
  expect(isLoginRoute('#/forgotpassword')).toBe(true);
  expect(isLoginRoute('#/forgotpasswordpin')).toBe(true);
  expect(isLoginRoute('#/home')).toBe(false);
  expect(isLoginRoute('#/loginx')).toBe(false);
});

test('mounts on login routes when enabled; unmounts on leaving', async () => {
  location.hash = '#/login';
  const d = deps();
  stop = initLogin(d);
  await flush();
  expect(document.querySelector('.tide-lg')).not.toBeNull();
  expect(document.documentElement.classList.contains('tide-login')).toBe(true);
  location.hash = '#/home';
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  await flush();
  expect(document.querySelector('.tide-lg')).toBeNull();
  expect(document.documentElement.classList.contains('tide-login')).toBe(false);
  expect(d.config).toHaveBeenCalledTimes(1);
});

test('disabled or unreachable: stays out of the way', async () => {
  location.hash = '#/login';
  stop = initLogin(deps(false));
  await flush();
  expect(document.querySelector('.tide-lg')).toBeNull();
  expect(document.documentElement.classList.contains('tide-login')).toBe(false);
  expect(document.documentElement.classList.contains('tide-cloak')).toBe(false);
});

test('never mounts on other routes', async () => {
  location.hash = '#/home';
  const d = deps();
  stop = initLogin(d);
  await flush();
  expect(d.config).not.toHaveBeenCalled();
  expect(document.querySelector('.tide-lg')).toBeNull();
});

test('a pending profile switch is handed to the screen', async () => {
  // A stock form that never answers keeps the screen on "Signing in as …".
  document.body.innerHTML = '<div id="loginPage" class="page"><form class="manualLoginForm"><input id="txtManualName"><input id="txtManualPassword"></form></div>';
  document.querySelector('form')!.addEventListener('submit', (e) => e.preventDefault());
  setPendingSwitch({ name: 'mila', password: 'mila', remember: true });
  location.hash = '#/login';
  stop = initLogin(deps());
  await flush();
  expect(document.querySelector('.tide-lg-card')?.getAttribute('data-state')).toBe('switching');
});
