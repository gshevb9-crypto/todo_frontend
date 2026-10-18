import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { handleLoginSuccess } = useAuth();

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const error = searchParams.get('error');
    if (error) {
      setStatus('error');
      setErrorMsg(decodeURIComponent(error));
      return;
    }

    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');
    const accessTokenExpiresAt = searchParams.get('accessTokenExpiresAt');
    const refreshTokenExpiresAt = searchParams.get('refreshTokenExpiresAt');

    if (accessToken && refreshToken && accessTokenExpiresAt && refreshTokenExpiresAt) {
      setStatus('success');
      const timer = setTimeout(() => {
        handleLoginSuccess({
          accessToken,
          refreshToken,
          accessTokenExpiresAt,
          refreshTokenExpiresAt,
        });
      }, 800);

      return () => clearTimeout(timer);
    } else {
      setStatus('error');
      setErrorMsg('Authentication parameters were incomplete or missing.');
    }
  }, [searchParams, handleLoginSuccess]);

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center', alignItems: 'center' }}>
        {status === 'loading' && (
          <>
            <div style={{ fontSize: '2.5rem', animation: 'spin 1.5s linear infinite' }}>⏳</div>
            <h2 style={{ fontSize: '1.3rem' }}>Signing you in...</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Securing your session and connecting to your workspace.
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{ fontSize: '2.5rem', color: 'var(--success)' }}>✓</div>
            <h2 style={{ fontSize: '1.3rem' }}>Authenticated Successfully</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Redirecting to your notes workspace...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize: '2.5rem', color: 'var(--danger)' }}>✕</div>
            <h2 style={{ fontSize: '1.3rem', color: 'var(--danger)' }}>Authentication Failed</h2>
            <div className="alert-error" style={{ width: '100%', textAlign: 'left' }}>
              {errorMsg}
            </div>
            <button
              type="button"
              className="btn-action-primary"
              style={{ marginTop: '1rem', width: '100%' }}
              onClick={() => navigate('/login', { replace: true })}
            >
              Back to Sign In
            </button>
          </>
        )}
      </div>
    </div>
  );
}
