import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { sendVerificationCode, verifyCode, getGoogleLoginUrl } from '../api/auth.api';

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

const OTP_LENGTH = 6;
const OTP_COOLDOWN = 180; // 3 minutes

export default function AuthPage() {
  const { handleLoginSuccess } = useAuth();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [timer, setTimer] = useState(0);

  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timer > 0) {
      timerRef.current = window.setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timer]);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `0${m}:${String(s).padStart(2, '0')}`;
  };

  const handleGoogleLogin = () => {
    const redirectUrl = `${window.location.origin}/callback`;
    window.location.href = getGoogleLoginUrl(redirectUrl);
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      await sendVerificationCode(email.trim());
      setOtpSent(true);
      setTimer(OTP_COOLDOWN);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Could not send verification code.';
      setErrorMsg(msg);
      if (err?.response?.status === 409) {
        setOtpSent(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (code.trim().length !== OTP_LENGTH) {
      setErrorMsg(`Please enter the complete ${OTP_LENGTH}-digit verification code.`);
      return;
    }

    setLoading(true);
    try {
      const tokens = await verifyCode(email.trim(), code.trim());
      handleLoginSuccess(tokens);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Verification code is invalid or expired.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-badge">
            <span>📝</span>
            <span>Personal Workspace</span>
          </div>
          <h1 className="auth-title">Welcome Back</h1>
          <p className="auth-subtitle">
            Sign in with Google or receive a magic verification code to your email.
          </p>
        </div>

        {/* Google OAuth Button */}
        <button type="button" className="btn-google" onClick={handleGoogleLogin}>
          <GoogleIcon />
          <span>Continue with Google</span>
        </button>

        <div className="auth-divider">
          <span>or email code</span>
        </div>

        {errorMsg && <div className="alert-error">{errorMsg}</div>}

        {!otpSent ? (
          <form className="auth-form" onSubmit={handleSendCode}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? 'Sending code...' : 'Send Verification Code'}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleVerifyCode}>
            <div className="form-group">
              <label className="form-label">Verification Code sent to {email}</label>
              <input
                type="text"
                placeholder="6-digit code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
                style={{ textAlign: 'center', letterSpacing: '8px', fontSize: '1.25rem', fontFamily: 'var(--font-mono)' }}
              />
            </div>

            {timer > 0 ? (
              <div className="countdown-timer">Resend available in {formatTimer(timer)}</div>
            ) : (
              <button
                type="button"
                className="btn-action-secondary"
                style={{ alignSelf: 'center', fontSize: '0.82rem' }}
                onClick={handleSendCode}
                disabled={loading}
              >
                Resend Code
              </button>
            )}

            <button type="submit" className="btn-submit" disabled={loading || code.length !== OTP_LENGTH}>
              {loading ? 'Verifying...' : 'Verify & Enter Workspace'}
            </button>

            <button
              type="button"
              className="btn-action-secondary"
              style={{ alignSelf: 'center', fontSize: '0.8rem', border: 'none', background: 'transparent', color: 'var(--text-muted)' }}
              onClick={() => {
                setOtpSent(false);
                setCode('');
                setErrorMsg('');
              }}
            >
              ← Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
