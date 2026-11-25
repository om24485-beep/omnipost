import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, KeyRound, Layers, Repeat2, Send, ShieldCheck } from 'lucide-react';
import { api } from '../api.js';
import { browserCookies, useExtension } from '../extension.js';
import { Button, PlatformBadge, Spinner } from '../ui.jsx';

function GoogleG({ className = 'size-5' }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

const FEATURES = [
  { icon: Layers, title: 'One feed for everything', text: 'Your YouTube videos & Shorts, Instagram Reels and TikToks side by side.' },
  { icon: Send, title: 'Post once, publish everywhere', text: 'Pick a video, tick the platforms, hit publish. Schedule it for later.' },
  { icon: Repeat2, title: 'Repost from any link', text: 'Paste a link from YouTube, Instagram, TikTok and 1,800+ sites.' },
  { icon: KeyRound, title: 'No API keys. Free forever.', text: 'Runs on your computer with your own browser sessions.' },
];

export default function Login({ info, onDone }) {
  const [waiting, setWaiting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const timer = useRef(null);
  const gisRef = useRef(null);
  const ext = useExtension();
  const extRef = useRef(ext);
  extRef.current = ext;

  useEffect(() => () => clearInterval(timer.current), []);

  // After signing in, quietly connect every platform this browser is already signed in to (Connector only).
  const importLogins = (groups) => {
    if (!extRef.current) return;
    browserCookies(groups)
      .then((cookies) => api('/api/accounts/import', { method: 'POST', body: { cookies } }))
      .catch(() => {});
  };

  // Connector installed: use the Google account that is already signed in to this browser.
  async function startWithExtension() {
    setError('');
    setWaiting(true);
    setMessage('Using the Google account signed in to this browser…');
    try {
      const cookies = await browserCookies(['google']);
      await api('/api/auth/extension', { method: 'POST', body: { cookies } });
      importLogins(['instagram', 'tiktok']);
      onDone();
    } catch (e) {
      setError(e.message);
      setWaiting(false);
    }
  }

  // Optional official Google button when a (free) client id is configured.
  useEffect(() => {
    if (!info.googleClientId) return;
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => {
      window.google.accounts.id.initialize({
        client_id: info.googleClientId,
        callback: async ({ credential }) => {
          try {
            await api('/api/auth/google/idtoken', { method: 'POST', body: { credential } });
            importLogins(['google', 'instagram', 'tiktok']);
            onDone();
          } catch (e) { setError(e.message); }
        },
        use_fedcm_for_prompt: true,
        context: 'signin',
      });
      window.google.accounts.id.renderButton(gisRef.current, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', width: 320 });
      // Google's own popup, pre-filled with the account already signed in to this browser.
      window.google.accounts.id.prompt();
    };
    document.head.appendChild(s);
    return () => s.remove();
  }, [info.googleClientId, onDone]);

  async function start() {
    setError('');
    setWaiting(true);
    setMessage('Opening a secure Google sign-in window…');
    try {
      const { flowId } = await api('/api/auth/google/start', { method: 'POST' });
      clearInterval(timer.current);
      timer.current = setInterval(async () => {
        try {
          const f = await api(`/api/auth/google/flow/${flowId}`);
          setMessage(f.message);
          if (f.status === 'done') { clearInterval(timer.current); onDone(); }
          if (f.status === 'error') { clearInterval(timer.current); setError(f.error); setWaiting(false); }
        } catch (e) {
          clearInterval(timer.current); setError(e.message); setWaiting(false);
        }
      }, 1200);
    } catch (e) {
      setError(e.message);
      setWaiting(false);
    }
  }

  return (
    <div className="relative min-h-full overflow-hidden">
      <div className="blob pointer-events-none absolute -top-40 -left-32 size-[34rem] rounded-full bg-fuchsia-600/20 blur-3xl" />
      <div className="blob pointer-events-none absolute -right-40 bottom-[-12rem] size-[38rem] rounded-full bg-orange-500/15 blur-3xl [animation-delay:-6s]" />

      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-6 py-12 lg:grid-cols-[1.15fr_1fr]">
        <section>
          <div className="mb-8 flex items-center gap-3">
            <Logo />
            <span className="text-xl font-bold tracking-tight">OmniPost</span>
          </div>
          <h1 className="text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-6xl">
            Every video.<br />Every platform.<br /><span className="text-gradient">One place.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-zinc-400">
            Connect YouTube, Instagram and TikTok, see all your videos together, and publish to all of them with one click.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {FEATURES.map(({ icon: I, title, text }) => (
              <div key={title} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                <I className="mb-2.5 size-5 text-rose-400" />
                <div className="text-sm font-semibold">{title}</div>
                <div className="mt-1 text-sm text-zinc-400">{text}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-zinc-900/70 p-8 shadow-2xl backdrop-blur-xl sm:p-10">
          <div className="mb-6 flex -space-x-2">
            {['youtube', 'instagram', 'tiktok'].map((p) => <PlatformBadge key={p} id={p} size="lg" className="ring-4 ring-zinc-900" />)}
          </div>
          <h2 className="text-2xl font-bold">{info.hasOwner ? 'Welcome back' : 'Get started'}</h2>
          <p className="mt-1.5 text-sm text-zinc-400">
            {info.hasOwner ? 'Sign in with the Google account that owns this workspace.' : 'Sign in with Google to create your workspace. It takes 20 seconds.'}
          </p>

          <div className="mt-8 space-y-3">
            {info.googleClientId && <div ref={gisRef} className="flex min-h-11 justify-center" />}
            {(ext || !info.googleClientId) && (
            <button
              onClick={ext ? startWithExtension : start}
              disabled={waiting || !info.browserFound}
              className="flex h-13 w-full cursor-pointer items-center justify-center gap-3 rounded-full bg-white py-3.5 text-[15px] font-semibold text-zinc-900 shadow-lg transition hover:bg-zinc-100 active:scale-[0.99] disabled:cursor-default disabled:opacity-70"
            >
              {waiting ? <Spinner className="size-5" /> : <GoogleG />}
              {waiting ? 'Waiting for Google…' : ext ? 'Continue as the Google account in this browser' : 'Continue with Google'}
            </button>
            )}
            {info.googleClientId && !ext && !waiting && (
              <button onClick={start} disabled={!info.browserFound} className="block w-full cursor-pointer text-center text-xs text-zinc-500 hover:text-zinc-300">
                Popup not showing? Sign in through the OmniPost window instead
              </button>
            )}
          </div>

          {waiting && (
            <div className="pop mt-5 rounded-2xl border border-sky-400/20 bg-sky-400/[0.06] p-4 text-sm text-sky-100">
              <div className="font-medium">{message}</div>
              {!ext && <div className="mt-1 text-sky-200/70">A normal Chrome/Edge window opened. Sign in there — OmniPost never sees your password.</div>}
              <Button variant="ghost" size="sm" className="mt-2 -ml-2" onClick={() => { clearInterval(timer.current); setWaiting(false); }}>Cancel</Button>
            </div>
          )}
          {error && (
            <div className="pop mt-5 flex gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/[0.07] p-4 text-sm text-rose-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
            </div>
          )}
          {!info.browserFound && (
            <div className="mt-5 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-4 text-sm text-amber-200">
              OmniPost needs Google Chrome, Microsoft Edge or Brave installed. Install one and reload this page.
            </div>
          )}

          {ext === null && !info.googleClientId && (
            <p className="mt-4 text-xs text-zinc-500">
              Tip: install the OmniPost Connector extension (in the <code className="text-zinc-400">extension</code> folder) to sign in with the Google account already in this browser.
            </p>
          )}

          <div className="mt-8 flex items-start gap-2.5 border-t border-white/[0.07] pt-6 text-xs text-zinc-500">
            <ShieldCheck className="size-4 shrink-0 text-emerald-400/80" />
            Everything stays on this computer. Your sessions live in a private browser profile in the OmniPost data folder.
          </div>
        </section>
      </div>
    </div>
  );
}

export function Logo({ className = 'size-9' }) {
  return (
    <span className={`grid place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500 via-rose-500 to-orange-400 shadow-lg shadow-rose-500/30 ${className}`}>
      <svg viewBox="0 0 24 24" className="size-1/2 fill-white"><path d="M8 5.5v13l10.5-6.5z" /></svg>
    </span>
  );
}
