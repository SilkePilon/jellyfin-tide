// Completes the Jellyfin startup wizard and creates Movies + Shows libraries. Idempotent.
const BASE = process.env.JF_URL ?? 'http://localhost:8096';
const AUTH = 'MediaBrowser Client="tide-e2e", Device="e2e", DeviceId="tide-e2e", Version="0.1.0"';

async function req(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json', Authorization: token ? `${AUTH}, Token="${token}"` : AUTH };
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok && r.status !== 204) throw new Error(`${method} ${path} -> ${r.status}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

async function waitUp() {
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(BASE + '/System/Info/Public'); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Jellyfin did not start');
}

export async function getToken() {
  const r = await req('/Users/AuthenticateByName', { method: 'POST', body: { Username: 'tide', Pw: 'tide' } });
  return r.AccessToken;
}

export async function setup() {
  await waitUp();
  const info = await (await fetch(BASE + '/System/Info/Public')).json();
  if (!info.StartupWizardCompleted) {
    await req('/Startup/Configuration', { method: 'POST', body: { UICulture: 'en-US', MetadataCountryCode: 'US', PreferredMetadataLanguage: 'en' } });
    await req('/Startup/User');
    await req('/Startup/User', { method: 'POST', body: { Name: 'tide', Password: 'tide' } });
    await req('/Startup/RemoteAccess', { method: 'POST', body: { EnableRemoteAccess: true, EnableAutomaticPortMapping: false } });
    await req('/Startup/Complete', { method: 'POST' });
  }
  const token = await getToken();
  const folders = await req('/Library/VirtualFolders', { token });
  const have = new Set(folders.map((f) => f.Name));
  for (const [name, type, path] of [['Movies', 'movies', '/media/Movies'], ['Shows', 'tvshows', '/media/Shows']]) {
    if (!have.has(name)) {
      await req(`/Library/VirtualFolders?name=${name}&collectionType=${type}&refreshLibrary=true`, {
        method: 'POST', token, body: { LibraryOptions: { PathInfos: [{ Path: path }] } },
      });
    }
  }
  // Visible test profiles for the login picker: mila (password "mila") and noah (no password).
  const users = await req('/Users', { token });
  for (const [name, pw] of [['mila', 'mila'], ['noah', '']]) {
    let u = users.find((x) => x.Name === name);
    if (!u) u = await req('/Users/New', { method: 'POST', token, body: { Name: name, Password: pw } });
    const full = await req(`/Users/${u.Id}`, { token });
    if (full.Policy.IsHidden) await req(`/Users/${u.Id}/Policy`, { method: 'POST', token, body: { ...full.Policy, IsHidden: false } });
    if (!pw) await req(`/Users/${u.Id}/Password`, { method: 'POST', token, body: { ResetPassword: true } });
  }
  console.log('setup ok');
}

if (import.meta.url === `file://${process.argv[1]}`) await setup();
