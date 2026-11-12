/** A profile switch in progress: kept in memory only (never stored), consumed once by the login screen. */
export interface PendingSwitch { name: string; password: string; remember: boolean; at: number }
export const PENDING_MS = 60_000;
let pending: PendingSwitch | null = null;

export function setPendingSwitch(p: Omit<PendingSwitch, 'at'>, now = Date.now()): void { pending = { ...p, at: now }; }
export function takePendingSwitch(now = Date.now()): PendingSwitch | null {
  const p = pending;
  pending = null;
  return p && now - p.at < PENDING_MS ? p : null;
}
