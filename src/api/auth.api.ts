import axiosInstance, { TokenResponseDTO } from './axiosInstance';

export interface SendCodeRequest {
  email: string;
}

export interface VerifyCodeRequest {
  email: string;
  code: string;
}

export const sendVerificationCode = async (email: string): Promise<void> => {
  await axiosInstance.post('/api/Auth/send-verification-code', { email });
};

export const verifyCode = async (email: string, code: string): Promise<TokenResponseDTO> => {
  const { data } = await axiosInstance.post('/api/Auth/verify-code', { email, code });
  return data?.data || data;
};

export const getGoogleLoginUrl = (returnUrl: string): string => {
  const rawBase = (
    import.meta.env.VITE_API_BASE_URL ||
    (import.meta.env.PROD ? 'https://gshe.blitz.cloud' : '')
  ).trim();
  const normalizedBase = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase;
  const apiPrefix = normalizedBase.endsWith('/api') ? normalizedBase : `${normalizedBase}/api`;
  return `${apiPrefix}/Auth/google-login?returnUrl=${encodeURIComponent(returnUrl)}`;
};

export const refreshToken = async (tokenValue: string): Promise<TokenResponseDTO> => {
  const { data } = await axiosInstance.post('/api/Auth/refresh-token', { refreshToken: tokenValue });
  return data?.data || data;
};

export const revokeRefresh = async (tokenValue: string): Promise<void> => {
  await axiosInstance.post('/api/Auth/revoke-refresh', { refreshToken: tokenValue });
};

export const logout = async (): Promise<void> => {
  await axiosInstance.post('/api/Auth/logout');
};

export const getCurrentUserProfile = async (): Promise<any> => {
  const { data } = await axiosInstance.get('/api/Auth/me');
  return data?.data || data;
};
