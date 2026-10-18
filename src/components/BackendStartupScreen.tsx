import React from 'react';
import { useBackendReadiness } from '../context/BackendReadinessContext';

export default function BackendStartupScreen() {
  const { isProlonged, isChecking, retryNow, retryCount } = useBackendReadiness();

  return (
    <div className="startup-screen" dir="rtl" role="status" aria-live="polite">
      <div className="startup-container">
        <div className="startup-card">
          {/* Logo / Brand Icon with Ambient Glow */}
          <div className="startup-brand-wrapper">
            <div className="startup-icon-box">
              <svg
                className="startup-svg-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                <path d="M9 12h6" />
                <path d="M9 16h6" />
              </svg>
            </div>
          </div>

          {/* Primary Arabic Title */}
          <h1 className="startup-title">بنحمّل السيستم من أجلك...</h1>

          {/* Subtitle / Context */}
          {!isProlonged ? (
            <p className="startup-subtitle">
              جاري الاتصال بالخادم وتجهيز بيئة العمل الخاصة بك، لن يستغرق الأمر سوى لحظات.
            </p>
          ) : (
            <div className="startup-prolonged-alert" role="alert">
              <div className="startup-prolonged-header">
                <svg
                  className="startup-alert-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>الخادم يستغرق وقتاً أطول من المتوقع للاستيقاظ</span>
              </div>
              <p className="startup-prolonged-text">
                قد يكون الخادم في وضع السكون المؤقت ضمن الاستضافة السحابية. يتم استئناف الخدمة الآن وسنواصل المحاولة تلقائياً، أو يمكنك الضغط أدناه لإعادة الفحص فوراً.
              </p>
            </div>
          )}

          {/* Horizontal RTL Indeterminate Loading Indicator */}
          <div
            className="startup-progress-track"
            aria-label="مؤشر تحميل النظام"
            role="progressbar"
            aria-valuetext="جاري التحميل"
          >
            <div className="startup-progress-bar" />
          </div>

          {/* Action Area: Displayed especially during prolonged startup */}
          {isProlonged && (
            <div className="startup-action-area">
              <button
                type="button"
                className="startup-retry-btn"
                onClick={retryNow}
                disabled={isChecking}
                aria-label="إعادة المحاولة للاتصال بالخادم"
              >
                <svg
                  className={`startup-btn-icon ${isChecking ? 'spin' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                <span>{isChecking ? 'جاري الفحص الآن...' : 'إعادة المحاولة الآن'}</span>
              </button>

              <span className="startup-status-footnote">
                {retryCount > 0 ? `تم إجراء ${retryCount} محاولات فحص` : 'جاري الفحص التلقائي المستمر'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
