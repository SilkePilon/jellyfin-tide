import * as stock from '../src/login/stockLogin';

/** Fake of the probed stock 12.4 login pages (two cached #loginPage views: only the visible one counts). */
function fakeLogin(opts: { password?: string } = {}) {
  location.hash = '#/login?serverid=x';
  document.body.innerHTML = `
    <div id="loginPage" class="page hide"><form class="manualLoginForm"><input id="txtManualName"><input id="txtManualPassword"></form></div>
    <div id="loginPage" class="page">
      <form class="manualLoginForm hide"><input id="txtManualName"><input id="txtManualPassword" type="password">
        <input type="checkbox" class="chkRememberLogin" checked><button type="submit">Sign In</button></form>
      <button class="btnQuick">Use Quick Connect</button><button class="btnForgotPassword">Forgot Password</button>
      <button class="btnSelectServer hide">Change Server</button><div class="loginDisclaimer"> Be nice. </div>
    </div><div class="dialogContainer"></div>`;
  const page = document.querySelectorAll<HTMLElement>('#loginPage')[1]!;
  const submitted: { name: string; pw: string; remember: boolean }[] = [];
  page.querySelector('form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = (page.querySelector('#txtManualName') as HTMLInputElement).value;
    const pw = (page.querySelector('#txtManualPassword') as HTMLInputElement).value;
    submitted.push({ name, pw, remember: (page.querySelector('.chkRememberLogin') as HTMLInputElement).checked });
    setTimeout(() => {
      if (opts.password === undefined || pw === opts.password) location.hash = '#/home';
      else document.body.insertAdjacentHTML('beforeend', '<div class="toast toastVisible">Invalid username or password. Please try again.</div>');
    }, 20);
  });
  return { page, submitted };
}
const dialog = (id: string, text: string, button = 'Got It', onClick?: () => void) => {
  const d = document.createElement('div');
  d.className = 'dialog opened';
  if (id) d.id = id;
  d.innerHTML = `<div class="formDialogHeader"><h1>Title</h1></div><div class="formDialogContent"><div class="text">${text}</div></div><button>${button}</button>`;
  d.querySelector('button')!.addEventListener('click', () => { d.remove(); onClick?.(); });
  document.querySelector('.dialogContainer')!.append(d);
  return d;
};
afterEach(() => { document.body.innerHTML = ''; location.hash = ''; });

test('signIn fills the visible stock form, mirrors "remember", and resolves ok when the page navigates', async () => {
  const f = fakeLogin({ password: 'mila' });
  const r = await stock.signIn('mila', 'mila', false, 2000);
  expect(r).toEqual({ ok: true });
  expect(f.submitted).toEqual([{ name: 'mila', pw: 'mila', remember: false }]);
});

test('signIn returns the stock toast text as the error; a hung server times out', async () => {
  fakeLogin({ password: 'mila' });
  const r = await stock.signIn('mila', 'nope', true, 2000);
  expect(r).toEqual({ ok: false, error: 'Invalid username or password. Please try again.' });
  const page = document.querySelectorAll<HTMLElement>('#loginPage')[1]!;
  const form = page.querySelector('form')!;
  const hung = form.cloneNode(true) as HTMLFormElement;
  hung.addEventListener('submit', (e) => e.preventDefault());
  form.replaceWith(hung);
  expect(await stock.signIn('mila', 'mila', true, 150)).toEqual({ ok: false, error: 'Couldn’t reach the server. Try again.' });
});

test('quick connect: reads the code from the stock dialog; cancel uses the dialog history entry', async () => {
  const { page } = fakeLogin();
  page.querySelector('.btnQuick')!.addEventListener('click', () => {
    history.pushState({ usr: { dialogs: ['d1'] } }, '');
    const d = dialog('quickConnectAlert', 'Enter code 422478 to login', 'Cancel');
    window.addEventListener('popstate', () => d.remove(), { once: true });
  });
  expect(await stock.startQuickConnect(1000)).toBe('422478');
  stock.cancelQuickConnect();
  await new Promise((r) => setTimeout(r, 30));
  expect(document.querySelector('#quickConnectAlert')).toBeNull();
});

test('forgot password: submits the name, returns the alert text, PIN step submits the PIN', async () => {
  const { page } = fakeLogin();
  page.querySelector('.btnForgotPassword')!.addEventListener('click', () => {
    location.hash = '#/forgotpassword';
    document.body.insertAdjacentHTML('beforeend', '<div id="forgotPasswordPage" class="page"><form><input id="txtName"><button id="btnSubmit" type="submit">Submit</button></form></div>');
    document.querySelector('#forgotPasswordPage form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      dialog('', 'The following file has been created on your server and contains instructions on how to proceed Enter PIN here to finish Password reset /config/x.json', 'Got It', () => {
        location.hash = '#/forgotpasswordpin';
        document.body.insertAdjacentHTML('beforeend', '<div class="page forgotPasswordPinPage"><form><input id="txtPin"><button type="submit">Submit</button></form></div>');
        document.querySelector('.forgotPasswordPinPage form')!.addEventListener('submit', (ev) => {
          ev.preventDefault();
          dialog('', 'Invalid PIN', 'Got It');
        });
      });
    });
  });
  const r = await stock.forgotPassword('mila', 1000);
  expect(r.pin).toBe(true);
  expect(r.message).toContain('created on your server');
  expect(r.message).not.toContain('Got It');
  expect((document.querySelector('#txtName') as HTMLInputElement).value).toBe('mila');
  const p = await stock.submitPin('1234', 1000);
  expect(p).toEqual({ message: 'Invalid PIN', done: false });
});

test('disclaimer and server switch come from the stock page', () => {
  fakeLogin();
  expect(stock.disclaimer()).toBe('Be nice.');
  expect(stock.canSelectServer()).toBe(false);
});
