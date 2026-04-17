import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { env } from '../lib/env';
import { useAdminAuth } from '../context/AdminAuthContext';
import './Login.css';

type LoginStep = 'phone' | 'otp';

export default function Login() {
  const navigate = useNavigate();
  const { isAuthenticated, persistSession } = useAdminAuth();
  const [step, setStep] = useState<LoginStep>('phone');
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpExpiry, setOtpExpiry] = useState<number | null>(null);
  const [debugOtpHint, setDebugOtpHint] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const intervalRef = useRef<number | null>(null);

  const getRequestErrorMessage = (err: any, fallback: string) => {
    const backendMessage = err?.response?.data?.message;
    if (typeof backendMessage === 'string' && backendMessage.trim()) {
      return backendMessage;
    }

    if (Array.isArray(backendMessage) && backendMessage.length) {
      return backendMessage.join(', ');
    }

    if (err?.code === 'ERR_NETWORK' || !err?.response) {
      return `Cannot reach backend at ${env.apiUrl}. Start Backend or update VITE_API_URL.`;
    }

    return fallback;
  };

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
    }
  }, []);

  const handlePhoneChange = (value: string) => {
    setPhone(value.replace(/\D/g, '').slice(0, 10));
  };

  const startCountdown = (expiresInSeconds: number) => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
    }
    setOtpExpiry(expiresInSeconds);
    intervalRef.current = window.setInterval(() => {
      setOtpExpiry((current) => {
        if (!current || current <= 1) {
          if (intervalRef.current) {
            window.clearInterval(intervalRef.current);
          }
          setStep('phone');
          setOtpCode('');
          setError('OTP expired. Request a new one.');
          return null;
        }
        return current - 1;
      });
    }, 1000);
  };

  const requestOtp = async () => {
    if (phone.length !== 10) {
      setError('Enter a valid 10-digit phone number.');
      return;
    }

    setLoading(true);
    setError('');
    setDebugOtpHint('');
    try {
      const { data } = await api.post('/admin/auth/request-otp', { phone });
      setStep('otp');
      setOtpCode(data.debugOtp ?? '');
      setDebugOtpHint(
        data.debugOtp ? `Development OTP: ${data.debugOtp}. This is only returned outside production.` : '',
      );
      startCountdown(data.expiresInSeconds ?? 300);
    } catch (err: any) {
      setError(getRequestErrorMessage(err, 'Failed to send OTP.'));
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (otpCode.length !== 6) {
      setError('Enter a valid 6-digit OTP.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/admin/auth/verify-otp', {
        phone,
        otpCode,
      });
      persistSession({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        admin: data.admin,
      });
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setError(getRequestErrorMessage(err, 'Failed to verify OTP.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-grid" />
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark">QS</div>
          <div>
            <h1>QuickShield Admin</h1>
            <p>Claims, fraud, payouts, zones, and pricing control.</p>
          </div>
        </div>

        {step === 'phone' ? (
          <div className="login-panel">
            <div className="panel-copy">
              <h2>Admin Access</h2>
              <p>Sign in with the admin phone OTP flow backed by the NestJS backend.</p>
            </div>

            <label className="field">
              <span>Phone Number</span>
              <div className="phone-field">
                <span>+91</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => handlePhoneChange(event.target.value)}
                  placeholder="XXXXXXXXXX"
                  disabled={loading}
                />
              </div>
            </label>

            {error ? <p className="form-error">{error}</p> : null}

            <button className="primary-btn" onClick={requestOtp} disabled={loading}>
              {loading ? 'Sending OTP...' : 'Send OTP'}
            </button>
          </div>
        ) : (
          <div className="login-panel">
            <div className="panel-copy">
              <h2>Verify OTP</h2>
              <p>Enter the 6-digit code sent to {phone}.</p>
            </div>

            <label className="field">
              <span>OTP Code</span>
              <input
                className="otp-input"
                type="text"
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                disabled={loading}
              />
            </label>

            {debugOtpHint ? <p className="helper-text">{debugOtpHint}</p> : null}

            {otpExpiry !== null ? (
              <p className="helper-text">
                Expires in {Math.floor(otpExpiry / 60)}:{String(otpExpiry % 60).padStart(2, '0')}
              </p>
            ) : null}

            {error ? <p className="form-error">{error}</p> : null}

            <button className="primary-btn" onClick={verifyOtp} disabled={loading}>
              {loading ? 'Verifying...' : 'Verify and Login'}
            </button>
            <button
              className="secondary-btn"
              onClick={() => {
                setStep('phone');
                setOtpCode('');
                setError('');
                setDebugOtpHint('');
              }}
              disabled={loading}
            >
              Use Different Number
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
