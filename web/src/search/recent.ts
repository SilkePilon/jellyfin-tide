export const RECENT_MAX = 8;
const key = (userId: string) => `tide-recent:${userId}`;

export function loadRecent(userId: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key(userId)) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}
function save(userId: string, list: string[]): string[] {
  try { localStorage.setItem(key(userId), JSON.stringify(list)); } catch { /* storage blocked */ }
  return list;
}
export function addRecent(userId: string, q: string): string[] {
  const t = q.trim();
  if (!t) return loadRecent(userId);
  return save(userId, [t, ...loadRecent(userId).filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, RECENT_MAX));
}
export function removeRecent(userId: string, q: string): string[] {
  return save(userId, loadRecent(userId).filter((x) => x.toLowerCase() !== q.trim().toLowerCase()));
}
