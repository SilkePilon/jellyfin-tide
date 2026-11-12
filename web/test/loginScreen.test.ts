import { avatarColor, createLoginScreen } from '../src/login/screen';
import { setPendingSwitch, takePendingSwitch, PENDING_MS } from '../src/login/pending';

const USERS = [{ Id: 'u1', Name: 'mila' }, { Id: 'u2', Name: 'noah', PrimaryImageTag: 'tg' }];
const CFG = { enabled: true, serverName: 'Home Media', posters: [{ id: 'p1', tag: 't1' }, { id: 'p2', tag: 't2' }] };
function fakeStock(over: Record<string, unknown> = {}) {
  return {
    signIn: vi.fn(async (_n: string, pw: string) => (pw === 'mila' || pw === '' ? { ok: true } : { ok: false, error: 'Invalid username or password. Please try again.' })),
    startQuickConnect: vi.fn(async () => '422478'), cancelQuickConnect: vi.fn(),
    forgotPassword: vi.fn(async () => ({ message: 'The following file has been created on your server … Enter PIN here', pin: true })),
    submitPin: vi.fn(async () => ({ message: 'Invalid PIN', done: false })), backToLogin: vi.fn(),
    disclaimer: () => 'Be nice.', canSelectServer: () => false, selectServer: vi.fn(),
    ...over,
  } as any;
}
const make = (over: Partial<Parameters<typeof createLoginScreen>[0]> = {}) => {
  const stock = fakeStock();
  const s = createLoginScreen({ config: CFG, users: USERS, quickConnect: true, stock, pending: null, ...over });
  document.body.append(s.el);
  return { s, stock };
};
const flush = () => new Promise((r) => setTimeout(r, 0));
beforeEach(() => { (window as any).ApiClient = { serverAddress: () => 'http://jf' }; });
afterEach(() => { document.body.innerHTML = ''; });

test('profiles over the poster wall; brand shows the server name; avatar image or initial on a stable colour', () => {
  const { s } = make();
  expect(s.state()).toBe('profiles');
  expect(s.el.querySelectorAll('.tide-lg-wall i').length).toBeGreaterThanOrEqual(2);
  expect(s.el.querySelector('.tide-lg-wall i')!.getAttribute('style')).toContain('/Items/p1/Images/Primary');
  expect(s.el.querySelector('.tide-lg-brand')!.textContent).toContain('Home Media');
  const mila = s.el.querySelector('[data-user="u1"] .tide-lg-av') as HTMLElement;
  expect(mila.textContent).toBe('M');
  expect(avatarColor('mila')).toBe(avatarColor('mila'));
  expect((s.el.querySelector('[data-user="u2"] .tide-lg-av') as HTMLElement).style.backgroundImage).toContain('/Users/u2/Images/Primary');
  expect(s.el.querySelector('[data-lg="qc"]')).not.toBeNull();
  expect(s.el.querySelector('.tide-lg-disc')?.textContent).toBe('Be nice.');
});

test('pick a profile, wrong password shows the stock error inline, right password signs in', async () => {
  const { s, stock } = make();
  (s.el.querySelector('[data-user="u1"]') as HTMLElement).click();
  expect(s.state()).toBe('password');
  const pw = s.el.querySelector<HTMLInputElement>('input[name="password"]')!;
  pw.value = 'nope';
  s.el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await flush(); await flush();
  expect(stock.signIn).toHaveBeenCalledWith('mila', 'nope', true);
  expect(s.el.querySelector('.tide-lg-err')!.textContent).toContain('Invalid username or password');
  expect((s.el.querySelector('.tide-lg-err') as HTMLElement).hidden).toBe(false);
  pw.value = 'mila';
  s.el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
  expect(stock.signIn).toHaveBeenLastCalledWith('mila', 'mila', true);
  (s.el.querySelector('[data-lg="back"]') as HTMLElement).click();
  expect(s.state()).toBe('profiles');
});

test('other user / no public users: manual form with user name', async () => {
  const { s, stock } = make({ users: [] });
  expect(s.state()).toBe('manual');
  expect(s.el.querySelector('[data-lg="back"]')).toBeNull(); // no profiles to go back to
  s.el.querySelector<HTMLInputElement>('input[name="username"]')!.value = 'tide';
  s.el.querySelector<HTMLInputElement>('input[name="password"]')!.value = 'mila';
  s.el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
  expect(stock.signIn).toHaveBeenCalledWith('tide', 'mila', true);
});

test('quick connect shows the code in six boxes; back cancels the stock dialog', async () => {
  const { s, stock } = make();
  (s.el.querySelector('[data-lg="qc"]') as HTMLElement).click();
  await flush(); await flush();
  expect(s.state()).toBe('qc');
  expect([...s.el.querySelectorAll('.tide-lg-code b')].map((b) => b.textContent).join('')).toBe('422478');
  (s.el.querySelector('[data-lg="back"]') as HTMLElement).click();
  expect(stock.cancelQuickConnect).toHaveBeenCalled();
  expect(s.state()).toBe('profiles');
});

test('forgot password: message in the card, then the PIN step', async () => {
  const { s, stock } = make();
  (s.el.querySelector('[data-user="u1"]') as HTMLElement).click();
  (s.el.querySelector('[data-lg="forgot"]') as HTMLElement).click();
  expect(s.state()).toBe('forgot');
  expect(s.el.querySelector<HTMLInputElement>('input[name="username"]')!.value).toBe('mila');
  s.el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await flush(); await flush();
  expect(stock.forgotPassword).toHaveBeenCalledWith('mila');
  expect(s.state()).toBe('pin');
  expect(s.el.querySelector('.tide-lg-msg')!.textContent).toContain('created on your server');
  s.el.querySelector<HTMLInputElement>('input[name="pin"]')!.value = '1234';
  s.el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await flush(); await flush();
  expect(stock.submitPin).toHaveBeenCalledWith('1234');
  expect(s.el.querySelector('.tide-lg-err')!.textContent).toContain('Invalid PIN');
});

test('a pending profile switch signs in at once ("Signing in as …")', async () => {
  const { s, stock } = make({ pending: { name: 'mila', password: 'mila', remember: true, at: Date.now() } });
  expect(s.state()).toBe('switching');
  expect(s.el.textContent).toContain('Signing in as mila');
  await flush();
  expect(stock.signIn).toHaveBeenCalledWith('mila', 'mila', true);
});

test('pending switch is taken once and expires', () => {
  setPendingSwitch({ name: 'a', password: 'b', remember: true }, 1000);
  expect(takePendingSwitch(1000 + PENDING_MS - 1)?.name).toBe('a');
  expect(takePendingSwitch(1000)).toBeNull();
  setPendingSwitch({ name: 'a', password: 'b', remember: true }, 1000);
  expect(takePendingSwitch(1000 + PENDING_MS + 1)).toBeNull();
});

test('arrow keys move between profiles', () => {
  const { s } = make();
  const first = s.el.querySelector<HTMLElement>('[data-user="u1"]')!;
  first.focus();
  first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  expect(document.activeElement).toBe(s.el.querySelector('[data-user="u2"]'));
});
