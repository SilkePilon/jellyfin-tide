import { api } from './client';
import type { ClientConfig, HomeResponse, Quality, UserPrefs } from '../types';

export const getClientConfig = () => api<ClientConfig>('/Tide/ClientConfig');
export const getHome = () => api<HomeResponse>('/Tide/Home');
export const putPrefs = (p: UserPrefs) => api<UserPrefs>('/Tide/UserPrefs', { method: 'PUT', body: p });

export async function getQuality(ids: string[]): Promise<Record<string, Quality | null>> {
  if (!ids.length) return {};
  return api<Record<string, Quality | null>>('/Tide/Quality', { method: 'POST', body: { ids: ids.slice(0, 100) } });
}
