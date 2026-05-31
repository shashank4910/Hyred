'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Loader2 } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { SignUpLegalConsent } from '@/app/_components/LegalConsentFields';

type Mode = 'signin' | 'signup';

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [acceptedLegal, setAcceptedLegal] = useState(false);

  const safeNext = next && next.startsWith('/') ? next : '/';

  function requireLegalConsent(): boolean {
    if (mode === 'signin') return true;
    if (acceptedLegal) return true;
    setError('Please confirm you are 18+ and accept the Terms and Privacy Policy.');
    return false;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'signin') {
        const { error } = await supabaseBrowser.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push(safeNext);
        router.refresh();
      } else {
        if (!requireLegalConsent()) {
          setLoading(false);
          return;
        }
        const { data, error } = await supabaseBrowser.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
          },
        });
        if (error) throw error;
        // If email confirmation is required, there is no active session yet.
        if (!data.session) {
          setInfo(
            'Check your inbox to confirm your email, then sign in. (If confirmation is disabled, just sign in.)',
          );
          setMode('signin');
        } else {
          router.push(safeNext);
          router.refresh();
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function googleSignIn() {
    if (!requireLegalConsent()) return;
    setGoogleLoading(true);
    setError(null);
    try {
      const { error } = await supabaseBrowser.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
        },
      });
      if (error) throw error;
      // Browser redirects to Google — no further action here.
    } catch (e) {
      setError((e as Error).message);
      setGoogleLoading(false);
    }
  }

  return (
    <div className="card space-y-4">
      <button
        type="button"
        onClick={googleSignIn}
        disabled={googleLoading || loading || (mode === 'signup' && !acceptedLegal)}
        className="btn w-full justify-center gap-2"
      >
        {googleLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <GoogleIcon />
        )}
        Continue with Google
      </button>

      <div className="flex items-center gap-3 text-xs text-on-surface-variant">
        <span className="h-px flex-1 bg-outline-variant" />
        or
        <span className="h-px flex-1 bg-outline-variant" />
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div className="relative">
          <Mail className="absolute left-3 top-2.5 h-4 w-4 text-text-muted" />
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="input pl-9"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-2.5 h-4 w-4 text-text-muted" />
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            placeholder="Password"
            className="input pl-9"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-xs text-error">{error}</p>}
        {info && <p className="text-xs text-emerald-600">{info}</p>}
        {mode === 'signup' && (
          <SignUpLegalConsent checked={acceptedLegal} onChange={setAcceptedLegal} />
        )}
        <button
          type="submit"
          disabled={loading || (mode === 'signup' && !acceptedLegal)}
          className="btn-primary w-full"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : mode === 'signin' ? (
            'Sign in'
          ) : (
            'Create account'
          )}
        </button>
      </form>

      <p className="text-center text-xs text-on-surface-variant">
        {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError(null);
            setInfo(null);
            setAcceptedLegal(false);
          }}
          className="text-primary font-medium hover:underline"
        >
          {mode === 'signin' ? 'Sign up' : 'Sign in'}
        </button>
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 4.75 12 4.75Z"
      />
    </svg>
  );
}
