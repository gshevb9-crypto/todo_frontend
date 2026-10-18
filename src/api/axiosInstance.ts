import axios, { InternalAxiosRequestConfig, AxiosError, AxiosResponse } from 'axios';

export interface TokenResponseDTO {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  email?: string;
  fullName?: string;
}

const TOKEN_KEY = 'todo_notes_tokens';

export const saveTokens = (tokenData: TokenResponseDTO): void => {
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tokenData));
  } catch (err) {
    console.error('Failed to save tokens to localStorage', err);
  }
};

export const loadTokens = (): TokenResponseDTO | null => {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const clearTokens = (): void => {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // noop
  }
};

// ── Normalize baseURL ─────────────────────────────────────────
const rawApiBase = (
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD ? 'https://gshe.blitz.cloud' : '')
).trim();
const normalizedBaseUrl = rawApiBase.endsWith('/api')
  ? rawApiBase.slice(0, -4)
  : rawApiBase.endsWith('/')
  ? rawApiBase.slice(0, -1)
  : rawApiBase;

const axiosInstance = axios.create({
  baseURL: normalizedBaseUrl,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20_000,
});

// ── Request Interceptor: attach Bearer token ──────────────────
axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const tokens = loadTokens();
    if (tokens?.accessToken) {
      config.headers.Authorization = `Bearer ${tokens.accessToken}`;
    }
    return config;
  },
  (error: unknown) => Promise.reject(error)
);

// ── Response Interceptor: 401 token auto-refresh ──────────────
let isRefreshing = false;
let pendingRequests: { resolve: (token: string | null) => void; reject: (error: unknown) => void }[] = [];

const processPendingRequests = (error: unknown, token: string | null = null) => {
  pendingRequests.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  pendingRequests = [];
};

axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    const is401 = error.response?.status === 401;
    const alreadyRetried = originalRequest?._retry;
    const isRefreshEndpoint = originalRequest?.url?.includes('/refresh-token');

    if (is401 && !alreadyRetried && !isRefreshEndpoint) {
      if (isRefreshing) {
        return new Promise<string | null>((resolve, reject) => {
          pendingRequests.push({ resolve, reject });
        }).then((newToken) => {
          if (newToken && originalRequest) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
          }
          return axiosInstance(originalRequest);
        });
      }

      if (originalRequest) {
        originalRequest._retry = true;
      }
      isRefreshing = true;

      const tokens = loadTokens();
      if (!tokens?.refreshToken) {
        clearTokens();
        window.dispatchEvent(new CustomEvent('auth:expired'));
        return Promise.reject(error);
      }

      try {
        const { data: responseBody } = await axiosInstance.post('/api/Auth/refresh-token', {
          refreshToken: tokens.refreshToken,
        });

        const newTokenData = responseBody?.data || responseBody;
        saveTokens(newTokenData);
        processPendingRequests(null, newTokenData.accessToken);

        if (originalRequest) {
          originalRequest.headers.Authorization = `Bearer ${newTokenData.accessToken}`;
        }
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        processPendingRequests(refreshError);
        clearTokens();
        window.dispatchEvent(new CustomEvent('auth:expired'));
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
