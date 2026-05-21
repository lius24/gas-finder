// Sign-in route — web port of sign-in.tsx (route) + sign-in-panel.tsx (modal).
// The RN version was a modal overlay; the web version IS the page. Same three
// states: (1) signed in, (2) email step, (3) OTP step. Google OAuth with
// graceful inline degradation when the provider isn't enabled in Supabase.

import { LogIn, LogOut, Mail } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@core/auth';
import { supabase } from '@core/supabase';

import './SignIn.css';

export function SignIn() {
  const { session, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submitEmail = async () => {
    setError(null);
    setNotice(null);
    const trimmed = email.trim();
    if (!trimmed.includes('@') || trimmed.length < 5) {
      setError('Enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { shouldCreateUser: true },
      });
      if (err) {
        setError(err.message);
        return;
      }
      setEmail(trimmed);
      setStep('otp');
      setNotice(`We sent a 6-digit code to ${trimmed}.`);
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async () => {
    setError(null);
    setNotice(null);
    const trimmed = otp.trim();
    if (trimmed.length < 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: trimmed,
        type: 'email',
      });
      if (err) {
        setError(err.message);
        return;
      }
      navigate('/garage');
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (err) {
        // Most common case: provider not enabled in Supabase dashboard.
        if (/provider/i.test(err.message) || /not enabled/i.test(err.message)) {
          setError(
            "Google sign-in isn't enabled yet. Use email below instead.",
          );
        } else {
          setError(err.message);
        }
        setLoading(false);
        return;
      }
      // signInWithOAuth navigates away — the auth listener picks up the
      // session when the user returns. Leave loading=true to prevent flicker.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  // While the auth state is loading, show a quiet spinner so we don't flash
  // the sign-in form for a user who is already signed in.
  if (authLoading) {
    return (
      <div className="si-page">
        <div className="si-card">
          <span className="si-spinner" aria-label="Loading" />
        </div>
      </div>
    );
  }

  // — Signed-in state —
  if (session) {
    return (
      <div className="si-page">
        <div className="si-card">
          <div className="si-brand-rule" />
          <p className="si-kicker">YOUR ACCOUNT</p>
          <h1 className="si-title">Signed in.</h1>
          <p className="si-lede">
            You&apos;re signed in as{' '}
            <strong className="si-lede-strong">{session.user.email}</strong>.
          </p>
          <button
            type="button"
            className="si-outline-btn"
            onClick={handleSignOut}
            disabled={loading}
          >
            <LogOut size={15} className="si-btn-icon" />
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // — Email step —
  if (step === 'email') {
    return (
      <div className="si-page">
        <div className="si-card">
          <div className="si-brand-rule" />
          <p className="si-kicker">PUMP · CHECK-IN</p>
          <h1 className="si-title">Sign in to Pump</h1>
          <p className="si-lede">
            Save favorites, get price alerts, and sync across devices.
          </p>

          <button
            type="button"
            className={`si-google-btn${loading ? ' si-disabled' : ''}`}
            onClick={signInWithGoogle}
            disabled={loading}
          >
            <span className="si-google-mark" aria-hidden="true">
              <span className="si-google-mark-letter">G</span>
            </span>
            Continue with Google
          </button>

          <div className="si-divider">
            <span className="si-divider-line" />
            <span className="si-divider-text">or email</span>
            <span className="si-divider-line" />
          </div>

          <form
            className="si-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submitEmail();
            }}
          >
            <label className="si-label" htmlFor="si-email">
              Email address
            </label>
            <input
              id="si-email"
              className="si-input"
              type="email"
              placeholder="you@example.com"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              autoFocus
            />
            <button
              type="submit"
              className={`si-primary-btn${loading ? ' si-disabled' : ''}`}
              disabled={loading}
            >
              {loading ? (
                <span className="si-spinner si-spinner--inline" aria-label="Sending" />
              ) : (
                <>
                  <Mail size={15} className="si-btn-icon" />
                  Send code
                </>
              )}
            </button>
          </form>

          {notice ? <p className="si-notice">{notice}</p> : null}
          {error ? <p className="si-error">{error}</p> : null}
        </div>
      </div>
    );
  }

  // — OTP step —
  return (
    <div className="si-page">
      <div className="si-card">
        <div className="si-brand-rule" />
        <p className="si-kicker">VERIFY</p>
        <h1 className="si-title">Code, please.</h1>
        <p className="si-lede">
          {notice ?? `Check your email for the 6-digit code we sent to ${email}.`}
        </p>

        <form
          className="si-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submitOtp();
          }}
        >
          <label className="si-label" htmlFor="si-otp">
            One-time code
          </label>
          <input
            id="si-otp"
            className="si-input si-input--otp"
            type="text"
            inputMode="numeric"
            placeholder="123456"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            disabled={loading}
            autoFocus
          />
          <button
            type="submit"
            className={`si-primary-btn${loading ? ' si-disabled' : ''}`}
            disabled={loading}
          >
            {loading ? (
              <span className="si-spinner si-spinner--inline" aria-label="Verifying" />
            ) : (
              <>
                <LogIn size={15} className="si-btn-icon" />
                Verify &amp; sign in
              </>
            )}
          </button>
        </form>

        {error ? <p className="si-error">{error}</p> : null}

        <div className="si-otp-footer">
          <button
            type="button"
            className="si-link-btn"
            onClick={() => {
              setStep('email');
              setOtp('');
              setError(null);
              setNotice(null);
            }}
            disabled={loading}
          >
            ← Use a different email
          </button>
        </div>
      </div>
    </div>
  );
}
