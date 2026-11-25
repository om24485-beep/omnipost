import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Copy, ExternalLink, Eye, Heart, LayoutGrid, Link2, MessageCircle, Play, RefreshCw, Repeat2, Search } from 'lucide-react';
import { proxied } from '../api.js';
import { useStore } from '../store.jsx';
import { Button, Card, Empty, Modal, PLATFORM, PlatformBadge, PlatformIcon, cx, fmtDur, fmtNum, timeAgo, useToast } from '../ui.jsx';

function Thumb({ item, className }) {
  const [src, setSrc] = useState(proxied(item.thumbnail));
  if (!src) return <div className={cx('grid place-items-center bg-zinc-900', className)}><PlatformIcon id={item.platform} className="size-8 text-zinc-700" /></div>;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setSrc(item.fallbackThumb && src !== item.fallbackThumb ? item.fallbackThumb : null)}
      className={className}
    />
  );
}

function VideoCard({ item, onOpen }) {
  return (
    <button onClick={() => onOpen(item)} className="group pop relative aspect-[9/14] cursor-pointer overflow-hidden rounded-2xl bg-zinc-900 text-left ring-1 ring-white/[0.06] transition hover:-translate-y-0.5 hover:ring-white/20 hover:shadow-2xl hover:shadow-black/50">
      <Thumb item={item} className="absolute inset-0 size-full object-cover transition duration-700 group-hover:scale-[1.06]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/5 to-black/30" />
      <PlatformBadge id={item.platform} className="absolute top-2.5 left-2.5" />
      <div className="absolute top-2.5 right-2.5 flex gap-1.5">
        {item.kind && item.kind !== 'video' && <span className="rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase backdrop-blur">{item.kind}</span>}
        {item.duration ? <span className="rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium backdrop-blur">{fmtDur(item.duration)}</span> : null}
      </div>
      <div className="absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100">
        <span className="grid size-14 place-items-center rounded-full bg-white/20 ring-1 ring-white/40 backdrop-blur-md"><Play className="ml-0.5 size-6 fill-white text-white" /></span>
      </div>
      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className="line-clamp-2 text-[13px] leading-snug font-semibold">{item.title}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-300">
          {item.views != null && <span className="flex items-center gap-1"><Eye className="size-3" />{fmtNum(item.views)}</span>}
          {item.likes != null && <span className="flex items-center gap-1"><Heart className="size-3" />{fmtNum(item.likes)}</span>}
          {item.publishedAt && <span className="text-zinc-400">{timeAgo(item.publishedAt)}</span>}
        </div>
      </div>
    </button>
  );
}

function Player({ item }) {
  if (item.embed) {
    return <iframe src={item.embed} title={item.title} className="size-full" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />;
  }
  if (item.videoUrl) return <video src={proxied(item.videoUrl)} poster={proxied(item.thumbnail)} controls autoPlay playsInline className="size-full bg-black object-contain" />;
  return <Thumb item={item} className="size-full object-contain" />;
}

function VideoModal({ item, onClose }) {
  const { go, accounts } = useStore();
  const toast = useToast();
  if (!item) return null;
  const others = Object.keys(accounts).filter((p) => p !== item.platform);
  const vertical = item.vertical;
  return (
    <Modal open onClose={onClose} className={vertical ? 'max-w-4xl' : 'max-w-6xl'}>
      <div className={cx('grid', vertical ? 'md:grid-cols-[minmax(0,380px)_1fr]' : 'lg:grid-cols-[1fr_340px]')}>
        <div className={cx('bg-black', vertical ? 'aspect-[9/16] max-h-[80vh]' : 'aspect-video')}>
          <Player item={item} />
        </div>
        <div className="flex flex-col p-6">
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <PlatformBadge id={item.platform} size="sm" /> {PLATFORM[item.platform]?.name}
            {item.publishedAt && <span>· {timeAgo(item.publishedAt)}</span>}
          </div>
          <h2 className="mt-3 text-lg leading-snug font-bold">{item.title}</h2>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[[Eye, item.views, 'views'], [Heart, item.likes, 'likes'], [MessageCircle, item.comments, 'comments']].map(([I, v, l]) => (
              <div key={l} className="rounded-xl bg-white/[0.04] p-3">
                <I className="size-4 text-zinc-500" />
                <div className="mt-1.5 text-base font-semibold">{fmtNum(v)}</div>
                <div className="text-[11px] text-zinc-500">{l}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 space-y-2">
            <Button variant="brand" className="w-full" icon={Repeat2} onClick={() => { onClose(); go('repost', { url: item.url }); }}>
              Cross-post{others.length ? ` to ${others.map((p) => PLATFORM[p].name).join(' & ')}` : ''}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 text-sm font-medium text-zinc-200 hover:bg-white/[0.06]">
                <ExternalLink className="size-4" /> Open
              </a>
              <Button variant="outline" icon={Copy} onClick={() => navigator.clipboard.writeText(item.url).then(() => toast('Link copied'))}>Copy link</Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function Feed() {
  const { feeds, syncing, accounts, syncFeed, go } = useStore();
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('new');
  const [open, setOpen] = useState(null);
  const connected = Object.keys(accounts);

  // Refresh stale feeds when the page opens.
  useEffect(() => {
    for (const p of connected) {
      const f = feeds[p];
      if (!f || Date.now() - (f.syncedAt || 0) > 15 * 60e3) syncFeed(p).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected.join()]);

  const all = useMemo(() => connected.flatMap((p) => (feeds[p]?.items || []).filter((i) => i.kind !== 'photo')), [feeds, connected.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = all.filter((i) => (filter === 'all' || i.platform === filter) && (!needle || i.title.toLowerCase().includes(needle)));
    if (sort === 'views') return [...list].sort((a, b) => (b.views || 0) - (a.views || 0));
    return [...list].sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
  }, [all, filter, q, sort]);

  const stats = connected.map((p) => {
    const list = all.filter((i) => i.platform === p);
    return { p, count: list.length, views: list.reduce((s, i) => s + (i.views || 0), 0) };
  });
  const totalViews = stats.reduce((s, x) => s + x.views, 0);
  const isSyncing = syncing.length > 0;
  const errors = connected.map((p) => feeds[p]?.error && { p, error: feeds[p].error }).filter(Boolean);

  if (!connected.length) {
    return (
      <Empty icon={Link2} title="Connect your first account" action={<Button variant="brand" size="lg" icon={Link2} onClick={() => go('accounts')}>Connect accounts</Button>}>
        Link YouTube, Instagram or TikTok and every video you've posted shows up here — in one beautiful feed.
      </Empty>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Your videos</h1>
          <p className="mt-1 text-sm text-zinc-400">{fmtNum(all.length)} videos · {fmtNum(totalViews)} total views across {connected.length} platform{connected.length > 1 ? 's' : ''}</p>
        </div>
        <Button variant="outline" icon={RefreshCw} loading={isSyncing} onClick={() => syncFeed()}>{isSyncing ? 'Syncing…' : 'Refresh'}</Button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs font-medium text-zinc-500 uppercase">All platforms</div>
          <div className="mt-1 text-2xl font-bold">{fmtNum(totalViews)}</div>
          <div className="text-xs text-zinc-500">views · {all.length} videos</div>
        </Card>
        {stats.map(({ p, count, views }) => (
          <Card key={p} className="relative overflow-hidden p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 uppercase"><PlatformBadge id={p} size="sm" />{PLATFORM[p].name}</div>
            <div className="mt-1 text-2xl font-bold">{fmtNum(views)}</div>
            <div className="text-xs text-zinc-500">views · {count} videos{syncing.includes(p) && ' · syncing…'}</div>
          </Card>
        ))}
      </div>

      {errors.map(({ p, error }) => (
        <div key={p} className="mb-3 flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
          <span className="flex-1"><b>{PLATFORM[p].name}:</b> {error}</span>
          <Button variant="ghost" size="xs" onClick={() => syncFeed(p)}>Retry</Button>
        </div>
      ))}

      <div className="sticky top-16 z-20 -mx-4 mb-5 flex flex-wrap items-center gap-2 bg-zinc-950/80 px-4 py-3 backdrop-blur-xl sm:-mx-8 sm:px-8">
        {['all', ...connected].map((p) => (
          <button
            key={p}
            onClick={() => setFilter(p)}
            className={cx('flex h-9 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-medium transition',
              filter === p ? 'bg-white text-zinc-950' : 'bg-white/[0.05] text-zinc-300 hover:bg-white/10')}
          >
            {p === 'all' ? <LayoutGrid className="size-4" /> : <PlatformIcon id={p} />}
            {p === 'all' ? 'All' : PLATFORM[p].name}
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles" className="input h-9 rounded-full pl-9" />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="input h-9 w-auto cursor-pointer rounded-full pr-8">
          <option value="new">Newest</option>
          <option value="views">Most viewed</option>
        </select>
      </div>

      {items.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((it) => <VideoCard key={`${it.platform}-${it.id}`} item={it} onOpen={setOpen} />)}
        </div>
      ) : isSyncing ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => <div key={i} className="skeleton aspect-[9/14] rounded-2xl" />)}
        </div>
      ) : (
        <Empty icon={Search} title={q ? 'No matches' : 'No videos yet'}>
          {q ? 'Try a different search.' : 'Nothing posted on this platform yet — create your first post!'}
        </Empty>
      )}

      <VideoModal item={open} onClose={() => setOpen(null)} />
    </div>
  );
}
