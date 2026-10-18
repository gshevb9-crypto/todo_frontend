import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearTokens, loadTokens, saveTokens, TokenResponseDTO } from '../api/axiosInstance';
import { logout as apiLogout, revokeRefresh } from '../api/auth.api';

export interface AuthContextValue {
  tokens: TokenResponseDTO | null;
  isAuthenticated: boolean;
  userEmail: string | null;
  userName: string | null;
  isLoggingOut: boolean;
  handleLoginSuccess: (tokenData: TokenResponseDTO) => void;
  handleLogout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [tokens, setTokens] = useState<TokenResponseDTO | null>(() => loadTokens());
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const isAuthenticated = Boolean(tokens?.accessToken);

  // Extract user email and name from JWT payload
  const { userEmail, userName } = useMemo(() => {
    if (!tokens?.accessToken) return { userEmail: null, userName: null };
    try {
      const payloadBase64 = tokens.accessToken.split('.')[1];
      const decodedJson = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
      const decoded = JSON.parse(decodedJson);

      const email = decoded['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress']
        || decoded.email
        || tokens.email
        || null;

      const name = decoded['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name']
        || decoded.name
        || tokens.fullName
        || (email ? email.split('@')[0] : null);

      return { userEmail: email, userName: name };
    } catch {
      return { userEmail: tokens.email || null, userName: tokens.fullName || null };
    }
  }, [tokens]);

  const handleLoginSuccess = useCallback((tokenData: TokenResponseDTO) => {
    saveTokens(tokenData);
    setTokens(tokenData);
    navigate('/', { replace: true });
  }, [navigate]);

  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      const currentTokens = loadTokens();
      if (currentTokens?.refreshToken) {
        await revokeRefresh(currentTokens.refreshToken).catch(() => {});
      }
      await apiLogout().catch(() => {});
    } finally {
      clearTokens();
      setTokens(null);
      setIsLoggingOut(false);
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    const onExpired = () => {
      clearTokens();
      setTokens(null);
      navigate('/login', { replace: true });
    };

    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [navigate]);

  const value = useMemo(
    () => ({
      tokens,
      isAuthenticated,
      userEmail,
      userName,
      isLoggingOut,
      handleLoginSuccess,
      handleLogout,
    }),
    [tokens, isAuthenticated, userEmail, userName, isLoggingOut, handleLoginSuccess, handleLogout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
