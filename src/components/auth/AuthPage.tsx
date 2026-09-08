import { useState } from 'react';
import { login, register } from '../../services/auth';

interface AuthPageProps {
  onDone: () => void;
}

export function AuthPage({ onDone }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password);
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-surface-container-lowest border border-outline-variant rounded p-8 flex flex-col gap-6">
        <div>
          <h1 className="font-display-lg text-display-lg text-on-surface">CDMM</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">
            {mode === 'login' ? 'Sign in to sync your data' : 'Create an account to sync your data'}
          </p>
        </div>
        <div className="flex gap-2">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`flex-1 px-4 py-2 rounded font-label-md text-label-md uppercase tracking-widest transition-colors ${
                mode === m
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {m === 'login' ? 'Login' : 'Register'}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
              Username
            </span>
            <input
              className="px-3 py-2 rounded border border-outline-variant bg-surface text-on-surface"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              minLength={3}
              maxLength={32}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
              Password
            </span>
            <input
              type="password"
              className="px-3 py-2 rounded border border-outline-variant bg-surface text-on-surface"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={mode === 'login' ? 1 : 8}
            />
          </label>
          {error && <p className="font-body-md text-body-md text-error">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded bg-primary text-on-primary font-label-lg text-label-lg uppercase tracking-widest disabled:opacity-50"
          >
            {busy ? 'Please wait…' : mode === 'login' ? 'Login' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
