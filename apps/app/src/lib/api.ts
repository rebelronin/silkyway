import { createHttpClient } from '@silkyway/sdk/dist/client.js';
import type { AxiosInstance } from 'axios';

const CLUSTER_API_URLS: Record<string, string> = {
  'mainnet-beta': process.env.NEXT_PUBLIC_MAINNET_API_URL || 'https://api.silkyway.ai',
  devnet: process.env.NEXT_PUBLIC_DEVNET_API_URL || 'https://devnet-api.silkyway.ai',
};

const DEV_FALLBACK = 'http://localhost:3000';

const clientCache = new Map<string, AxiosInstance>();

function resolveApiUrl(cluster: string): string {
  return CLUSTER_API_URLS[cluster] || (process.env.NODE_ENV === 'production' ? CLUSTER_API_URLS['mainnet-beta'] : DEV_FALLBACK);
}

function readCluster(): string {
  if (typeof window === 'undefined') return 'mainnet-beta';
  return localStorage.getItem('silkyway-cluster') || 'mainnet-beta';
}

export function getApi(): AxiosInstance {
  const cluster = readCluster();
  const url = resolveApiUrl(cluster);
  let client = clientCache.get(url);
  if (!client) {
    client = createHttpClient({ baseUrl: url });
    clientCache.set(url, client);
  }
  return client;
}

/** @deprecated Use getApi() instead */
export const api = new Proxy({} as AxiosInstance, {
  get(_target, prop, receiver) {
    return Reflect.get(getApi(), prop, receiver);
  },
});
