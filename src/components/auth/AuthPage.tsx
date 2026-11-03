import { useState } from 'react';
import { login, register } from '../../services/auth';
import { isDarkTheme } from '../../utils/color';
import { Logo, LogoLockup } from '../common/Logo';

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

  const isLogin = mode === 'login';
  const switchTo = (m: 'login' | 'register') => {
    setMode(m);
    setError(null);
  };

  return (
    <div className="min-h-dvh bg-background text-on-background flex">
      {/* Brand side (desktop): what the app is, drawn in its own language. */}
      <section
        className="max-lg:hidden flex-[1_1_560px] min-w-0 overflow-hidden px-[3.6rem] py-12 grid grid-rows-[1fr_auto_1fr] gap-[2.4rem] bg-surface-dim border-r border-outline-variant"
        style={{ '--u': BRAND_UNIT } as React.CSSProperties}
      >
        {/* Equal 1fr rows above and below keep the pitch centred on the full height. */}
        <span className="self-start flex items-center gap-[0.7rem]">
          <Logo size={40} />
          <span className="font-display text-[26px] leading-[32px] font-bold tracking-[-0.025em] text-on-surface">CDMM</span>
        </span>
        {/* Pitch on the left, picture on the right; the picture drops below the
            pitch when the column is too narrow for both, so it never spills
            past the divider onto the form. */}
        <div className="min-w-0 flex flex-wrap items-center" style={{ gap: u(48) }}>
          <div className="min-w-0 flex flex-col" style={{ gap: u(28.8), flex: `1 1 ${u(300)}`, maxWidth: u(480) }}>
            <h1
              className="m-0 font-display font-bold tracking-[-0.03em] text-on-surface"
              style={{ fontSize: u(44), lineHeight: u(48) }}
            >
              Plan the day. Log what really happened.
            </h1>
            <ul className="flex flex-col" style={{ gap: u(12.8) }}>
              {FEATURES.map(([icon, text]) => (
                <li key={icon} className="flex items-start" style={{ gap: u(11.2) }}>
                  <span className="material-symbols-outlined text-primary" style={{ fontSize: u(20) }} aria-hidden="true">
                    {icon}
                  </span>
                  <span className="text-lead text-on-surface" style={{ fontSize: u(15), lineHeight: u(23) }}>
                    {text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <DayPreview />
        </div>
        <p className="self-end text-meta text-on-surface-variant">Self-hosted. Your data stays on your own server.</p>
      </section>

      {/* Form side */}
      <section className="flex-[1_1_420px] min-w-0 flex items-center justify-center px-8 py-12 max-lg:px-5">
        <div className="w-full max-w-[22rem] flex flex-col gap-[1.4rem]">
          <LogoLockup className="lg:hidden mb-2" />
          <div className="flex flex-col gap-[0.3rem]">
            <h2 className="text-[26px] leading-[32px] font-display font-semibold tracking-[-0.02em] text-on-surface">
              {isLogin ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="text-body text-on-surface-variant">
              {isLogin ? 'Sign in to sync your data across devices.' : 'One account keeps the phone and the computer in sync.'}
            </p>
          </div>
          <div className="seg flex" role="tablist" aria-label="Sign in or create an account">
            <button type="button" role="tab" aria-selected={isLogin} onClick={() => switchTo('login')} className="flex-1">
              Sign in
            </button>
            <button type="button" role="tab" aria-selected={!isLogin} onClick={() => switchTo('register')} className="flex-1">
              Create account
            </button>
          </div>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <label className={LABEL}>
              Username
              <input
                className={FIELD}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                minLength={3}
                maxLength={32}
              />
            </label>
            <label className={LABEL}>
              Password
              <input
                type="password"
                className={FIELD}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                required
                minLength={isLogin ? 1 : 8}
              />
            </label>
            {!isLogin && <p className="text-meta text-on-surface-variant">At least 8 characters.</p>}
            {error && <p className="text-body text-error">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="mt-[0.3rem] w-full py-[0.65rem] rounded-[0.6rem] bg-primary text-on-primary text-[14px] leading-5 font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {busy ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

/**
 * The brand pitch scales with the screen: 1px per design px up to a 1440×900
 * viewport, growing with whichever of width/height runs out first, capped at 1.75×.
 */
const BRAND_UNIT = 'clamp(1px, min(0.0694vw, 0.111vh), 1.75px)';
const u = (px: number) => `calc(${px} * var(--u))`;

const LABEL = 'flex flex-col gap-[0.35rem] text-[13px] leading-[18px] font-medium text-on-surface-variant';
const FIELD =
  'w-full px-[0.8rem] py-[0.6rem] rounded-[0.6rem] border border-outline-variant bg-surface-container-low text-on-surface text-[14px] outline-none focus:border-primary transition-colors';

const FEATURES: [string, string][] = [
  ['calendar_today', 'Plan study blocks for the day and the week.'],
  ['timer', 'Start a focus session with one key, finish it with another.'],
  ['bar_chart', 'See where the day kept to the plan, and where it didn’t.'],
];

/** [subject, colour, top %, height %] for the logged and the planned column. */
type Block = [string, string, number, number];
const REAL: Block[] = [
  ['Linear Algebra', '#E9826A', 0, 22],
  ['English', '#7F9464', 25, 13],
  ['Algorithms', '#4F6E8C', 41, 19],
];
const PLAN: Block[] = [
  ['Linear Algebra', '#E9826A', 0, 22],
  ['English', '#7F9464', 24, 15],
  ['Algorithms', '#4F6E8C', 41, 19],
  ['Physics', '#E0975A', 64, 22],
];
const TICKS = ['08:00', '10:00', '12:00', '14:00', '16:00'];

/** A sample day: logged blocks up to now on the left, planned on the right. */
function DayPreview() {
  // Same look as TimelineEvent: real blocks muted with a spine, plans solid.
  const realText = isDarkTheme() ? '#fff' : '#000';
  return (
    <div
      role="img"
      aria-label="A day: logged study blocks up to now on the left, planned blocks on the right"
      className="relative shrink-0 max-w-full overflow-hidden border border-outline-variant bg-surface-container-lowest"
      style={{ width: u(416), height: u(208), borderRadius: u(16), padding: `${u(16)} ${u(19.2)} ${u(16)} ${u(51.2)}` }}
    >
      {TICKS.map((t, i) => (
        <span
          key={t}
          className="absolute -translate-y-1/2 font-mono text-on-surface-variant"
          style={{
            left: u(14.4),
            fontSize: u(10.5),
            lineHeight: u(12),
            top: `calc(${u(16)} + (100% - ${u(32)}) * ${i / (TICKS.length - 1)})`,
          }}
        >
          {t}
        </span>
      ))}
      <div className="relative h-full flex" style={{ gap: u(9.6) }}>
        {[REAL, PLAN].map((blocks, col) => (
          <div key={col} className="relative flex-1">
            {blocks.map(([name, color, top, height]) => (
              <div
                key={name}
                className="absolute inset-x-0 overflow-hidden"
                style={{
                  borderRadius: u(6),
                  top: `${top}%`,
                  height: `${height}%`,
                  background: col === 0 ? `color-mix(in srgb, ${color} 42%, var(--color-surface-dim))` : color,
                }}
              >
                {col === 0 && <span className="absolute left-0 inset-y-0 w-[3px]" style={{ background: color }} />}
                <span
                  className="absolute font-semibold whitespace-nowrap"
                  style={{
                    left: u(9.6),
                    top: u(4.8),
                    fontSize: u(12),
                    lineHeight: u(16),
                    color: col === 0 ? realText : '#0B0B0A',
                  }}
                >
                  {name}
                </span>
              </div>
            ))}
          </div>
        ))}
        <div className="absolute right-0 top-[62%] flex items-center" style={{ left: `calc(-1 * ${u(6.4)})` }}>
          <span className="rounded-full bg-now" style={{ width: u(7), height: u(7) }} />
          <span className="flex-1 h-px bg-now" />
        </div>
      </div>
    </div>
  );
}
