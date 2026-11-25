import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Globe, Info, Loader2, X } from 'lucide-react';

export const cx = (...a) => a.filter(Boolean).join(' ');

// ------------------------------------------------------------------ formatting
export function fmtNum(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}
export function fmtDur(s) {
  if (!s && s !== 0) return '';
  s = Math.round(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
export function fmtBytes(b) {
  if (!b) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  return `${(b / 1024 ** i).toFixed(i > 1 ? 1 : 0)} ${u[i]}`;
}
export function timeAgo(t) {
  if (!t) return '';
  const s = (Date.now() - t) / 1000;
  const fut = s < 0;
  const a = Math.abs(s);
  const [v, unit] = a < 60 ? [a, 'second'] : a < 3600 ? [a / 60, 'minute'] : a < 86400 ? [a / 3600, 'hour']
    : a < 2592000 ? [a / 86400, 'day'] : a < 31536000 ? [a / 2592000, 'month'] : [a / 31536000, 'year'];
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.round(fut ? v : -v), unit);
}

// ------------------------------------------------------------------ primitives
export function Button({ variant = 'primary', size = 'md', className, loading, icon: Icon, children, disabled, ...p }) {
  const v = {
    primary: 'bg-white text-zinc-950 hover:bg-zinc-200',
    brand: 'text-white bg-gradient-to-r from-fuchsia-500 via-rose-500 to-orange-400 hover:brightness-110 shadow-lg shadow-rose-500/25',
    ghost: 'text-zinc-300 hover:bg-white/[0.06] hover:text-white',
    outline: 'border border-white/10 text-zinc-200 hover:bg-white/[0.06] hover:border-white/20',
    danger: 'border border-rose-500/25 text-rose-300 hover:bg-rose-500/10',
  }[variant];
  const s = { xs: 'h-7 px-2.5 text-xs gap-1.5 rounded-lg', sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg', md: 'h-10 px-4 text-sm gap-2 rounded-xl', lg: 'h-12 px-6 text-[15px] gap-2.5 rounded-xl' }[size];
  return (
    <button
      {...p}
      disabled={loading || disabled}
      className={cx('inline-flex cursor-pointer items-center justify-center font-medium whitespace-nowrap transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45', v, s, className)}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon && <Icon className="size-4 shrink-0" />}
      {children}
    </button>
  );
}

export const Card = ({ className, children, ...p }) => (
  <div {...p} className={cx('rounded-2xl border border-white/[0.07] bg-zinc-900/50 backdrop-blur-sm', className)}>{children}</div>
);

export const Spinner = ({ className }) => <Loader2 className={cx('size-4 animate-spin', className)} />;

export function Progress({ value, className }) {
  return (
    <div className={cx('h-1.5 overflow-hidden rounded-full bg-white/[0.07]', className)}>
      <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 via-rose-500 to-orange-400 transition-[width] duration-300" style={{ width: `${Math.max(2, Math.min(100, value || 0))}%` }} />
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span>
        <span className="block text-sm font-medium text-zinc-200">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-zinc-500">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-rose-500' : 'bg-white/10')}
      >
        <span className={cx('absolute top-0.5 size-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </label>
  );
}

export function Empty({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 px-6 py-16 text-center">
      {Icon && <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-white/[0.04] ring-1 ring-white/10"><Icon className="size-6 text-zinc-400" /></div>}
      <h3 className="text-lg font-semibold">{title}</h3>
      {children && <p className="mt-1.5 max-w-md text-sm text-zinc-400">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, children, className }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-md sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('pop relative max-h-full w-full overflow-auto rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl', className)}>
        <button onClick={onClose} className="absolute top-3 right-3 z-10 grid size-9 cursor-pointer place-items-center rounded-full bg-black/50 text-zinc-300 hover:bg-white/10 hover:text-white" aria-label="Close">
          <X className="size-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ toasts
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const toast = useCallback((message, type = 'success', ms = 4200) => {
    const id = Math.random().toString(36).slice(2);
    setItems((l) => [...l.slice(-3), { id, message, type }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), ms);
  }, []);
  const Icons = { success: CheckCircle2, error: AlertTriangle, info: Info };
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-20 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 md:bottom-4">
        {items.map((t) => {
          const I = Icons[t.type] || Info;
          return (
            <div key={t.id} className={cx('pop pointer-events-auto flex items-start gap-3 rounded-2xl border bg-zinc-900/95 px-4 py-3 text-sm shadow-xl backdrop-blur',
              t.type === 'error' ? 'border-rose-500/30' : 'border-white/10')}>
              <I className={cx('mt-0.5 size-4 shrink-0', t.type === 'error' ? 'text-rose-400' : t.type === 'info' ? 'text-sky-400' : 'text-emerald-400')} />
              <span className="text-zinc-200">{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

// ------------------------------------------------------------------ platforms
export const PLATFORM = {
  youtube: { name: 'YouTube', bg: 'bg-[#ff0033]', text: 'text-[#ff4d6d]', ring: 'ring-[#ff0033]/50', glow: 'shadow-[#ff0033]/20' },
  instagram: { name: 'Instagram', bg: 'bg-gradient-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5]', text: 'text-[#f56fa1]', ring: 'ring-[#d62976]/50', glow: 'shadow-[#d62976]/20' },
  tiktok: { name: 'TikTok', bg: 'bg-zinc-950 ring-1 ring-white/20', text: 'text-[#25f4ee]', ring: 'ring-[#25f4ee]/50', glow: 'shadow-[#25f4ee]/20' },
};

export function PlatformIcon({ id, className = 'size-4' }) {
  if (id === 'youtube') {
    return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z" /></svg>;
  }
  if (id === 'instagram') {
    return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><rect x="2.5" y="2.5" width="19" height="19" rx="5.5" /><circle cx="12" cy="12" r="4.3" /><circle cx="17.6" cy="6.4" r="1.3" fill="currentColor" stroke="none" /></svg>;
  }
  if (id === 'tiktok') {
    return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden><path d="M16.6 2h-3.4v13.3a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9a6.4 6.4 0 1 0 5.4 6.3V8.5a7.7 7.7 0 0 0 4.5 1.4V6.5A4.5 4.5 0 0 1 16.6 2z" /></svg>;
  }
  return <Globe className={className} />;
}

export function PlatformBadge({ id, size = 'md', className }) {
  const s = { sm: 'size-5 [&_svg]:size-3', md: 'size-7 [&_svg]:size-3.5', lg: 'size-10 [&_svg]:size-5' }[size];
  return (
    <span className={cx('grid shrink-0 place-items-center rounded-full text-white shadow-lg', PLATFORM[id]?.bg || 'bg-zinc-700', s, className)}>
      <PlatformIcon id={id} />
    </span>
  );
}

export function Avatar({ src, name, className = 'size-9' }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={cx('rounded-full object-cover', className)} />;
  return <span className={cx('grid place-items-center rounded-full bg-gradient-to-br from-fuchsia-500 to-orange-400 text-sm font-semibold text-white', className)}>{(name || '?').slice(0, 1).toUpperCase()}</span>;
}
