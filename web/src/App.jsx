import { useEffect, useState } from 'react';
import { Film, LayoutGrid, Link2, ListChecks, LogOut, PlusCircle, Repeat2, Search } from 'lucide-react';
import { api, isUrl } from './api.js';
import { useStore } from './store.jsx';
import { Avatar, Spinner, cx, useToast } from './ui.jsx';
import { Logo } from './pages/Login.jsx';
import Feed from './pages/Feed.jsx';
import Create from './pages/Create.jsx';
import Repost from './pages/Repost.jsx';
import Library from './pages/Library.jsx';
import Queue from './pages/Queue.jsx';
import Accounts from './pages/Accounts.jsx';

const NAV = [
  { id: 'feed', label: 'Feed', icon: LayoutGrid },
  { id: 'create', label: 'Create', icon: PlusCircle },
  { id: 'repost', label: 'Repost', icon: Repeat2 },
  { id: 'library', label: 'Library', icon: Film },
  { id: 'queue', label: 'Queue', icon: ListChecks },
  { id: 'accounts', label: 'Accounts', icon: Link2 },
];
const PAGES = { feed: Feed, create: Create, repost: Repost, library: Library, queue: Queue, accounts: Accounts };

function QuickLink() {
  const { go } = useStore();
  const [v, setV] = useState('');
  return (
    <form
      className="relative hidden w-full max-w-md sm:block"
      onSubmit={(e) => { e.preventDefault(); if (isUrl(v)) { go('repost', { url: v.trim() }); setV(''); } }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-zinc-500" />
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="Paste any video link to repost it…"
        className="input h-10 rounded-full pl-10"
      />
    </form>
  );
}

export default function App() {
  const store = useStore();
  const { ready, route, user, jobs, accounts, go, onSignedOut } = store;
  const toast = useToast();
  const Page = PAGES[route] || Feed;
  const active = jobs.filter((j) => j.status === 'running' || (j.status === 'queued' && !j.scheduledAt)).length;
  const needsAttention = Object.values(accounts).some((a) => a.needsReconnect);

  // Paste a link anywhere (outside a text field) to jump straight into Repost.
  useEffect(() => {
    const onPaste = (e) => {
      const t = e.target;
      if (t.closest?.('input, textarea, [contenteditable="true"]')) return;
      const text = e.clipboardData?.getData('text') || '';
      if (isUrl(text)) { go('repost', { url: text.trim() }); toast('Link pasted — fetching video…', 'info'); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [go, toast]);

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    onSignedOut();
  }

  if (!ready) return <div className="grid h-full place-items-center"><Spinner className="size-6 text-zinc-500" /></div>;

  const badge = (id) => (id === 'queue' && active ? active : id === 'accounts' && needsAttention ? '!' : null);

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/[0.06] bg-zinc-950/60 px-4 py-6 backdrop-blur md:flex">
        <button onClick={() => go('feed')} className="mb-8 flex cursor-pointer items-center gap-3 px-2">
          <Logo />
          <span className="text-lg font-bold tracking-tight">OmniPost</span>
        </button>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ id, label, icon: I }) => (
            <button
              key={id}
              onClick={() => go(id)}
              className={cx('group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                route === id ? 'bg-white/[0.08] text-white' : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100')}
            >
              <I className={cx('size-[18px]', route === id && 'text-rose-400')} />
              {label}
              {badge(id) && <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold text-white">{badge(id)}</span>}
            </button>
          ))}
        </nav>
        <button
          onClick={() => go('create')}
          className="mb-5 flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 via-rose-500 to-orange-400 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:brightness-110"
        >
          <PlusCircle className="size-4" /> New post
        </button>
        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-2.5">
          <Avatar src={user?.avatar} name={user?.name} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user?.name}</div>
            <div className="truncate text-xs text-zinc-500">{user?.email}</div>
          </div>
          <button onClick={logout} title="Sign out" className="grid size-8 cursor-pointer place-items-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-white">
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-white/[0.06] bg-zinc-950/70 px-4 backdrop-blur-xl sm:px-8">
          <div className="flex items-center gap-2.5 md:hidden"><Logo className="size-8" /><span className="font-bold">OmniPost</span></div>
          <QuickLink />
          <div className="ml-auto flex items-center gap-2 md:hidden">
            <Avatar src={user?.avatar} name={user?.name} className="size-8" />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-28 sm:px-8 md:pb-12">
          <Page key={route} />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-white/[0.06] bg-zinc-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        {NAV.map(({ id, label, icon: I }) => (
          <button key={id} onClick={() => go(id)} className={cx('relative flex cursor-pointer flex-col items-center gap-1 py-2.5 text-[10px] font-medium', route === id ? 'text-white' : 'text-zinc-500')}>
            <I className={cx('size-5', route === id && 'text-rose-400')} />
            {label}
            {badge(id) && <span className="absolute top-1.5 right-[calc(50%-18px)] size-2 rounded-full bg-rose-500" />}
          </button>
        ))}
      </nav>
    </div>
  );
}
