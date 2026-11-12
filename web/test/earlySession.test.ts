test('earlySession reads the newest stored login and the server from the client.js URL (base URL kept)', async () => {
  vi.resetModules();
  const s = document.createElement('script');
  s.src = 'https://media.example/jellyfin/Tide/client.js?v=0.4.1';
  Object.defineProperty(document, 'currentScript', { value: s, configurable: true });
  const { earlySession } = await import('../src/api/client');
  expect(earlySession()).toBeNull();
  localStorage.setItem('jellyfin_credentials', JSON.stringify({ Servers: [
    { AccessToken: 'old', UserId: 'u1', DateLastAccessed: 1 },
    { AccessToken: 'new', UserId: 'u2', DateLastAccessed: 5 },
    { UserId: 'u3', DateLastAccessed: 9 },
  ] }));
  expect(earlySession()).toEqual({ server: 'https://media.example/jellyfin', token: 'new', userId: 'u2' });
  Object.defineProperty(document, 'currentScript', { value: null, configurable: true });
  vi.resetModules();
});
