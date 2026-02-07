import axios, { AxiosInstance, AxiosError } from 'axios';

const DEFAULT_TIMEOUT = 30000;

export interface ClientConfig {
  baseUrl?: string;
  timeout?: number;
}

export function createHttpClient(config: ClientConfig = {}): AxiosInstance {
  const client = axios.create({
    baseURL: config.baseUrl || 'http://localhost:3000',
    timeout: config.timeout || DEFAULT_TIMEOUT,
    headers: { 'Content-Type': 'application/json' },
  });

  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError<{ ok: boolean; error?: string; message?: string }>) => {
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      if (error.code === 'ECONNABORTED') {
        throw new Error('Request timeout — is the Handshake server running?');
      }
      throw new Error('Network error — is the Handshake server running?');
    },
  );

  return client;
}
