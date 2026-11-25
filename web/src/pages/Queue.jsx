import { useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, ExternalLink, Image, ListChecks, Loader2, RotateCcw, Trash2, XCircle } from 'lucide-react';
import { api } from '../api.js';
import { useStore } from '../store.jsx';
import { Button, Card, Empty, PLATFORM, PlatformBadge, cx, timeAgo, useToast } from '../ui.jsx';

const STATUS = {
  queued: { label: 'Queued', cls: 'bg-zinc-500/15 text-zinc-300', icon: Clock },
  running: { label: 'Publishing', cls: 'bg-sky-500/15 text-sky-300', icon: Loader2 },
  done: { label: 'Published', cls: 'bg-emerald-500/15 text-emerald-300', icon: CheckCircle2 },
  partial: { label: 'Partly published', cls: 'bg-amber-500/15 text-amber-300', icon: AlertTriangle },
  failed: { label: 'Failed', cls: 'bg-rose-500/15 text-rose-300', icon: XCircle },
  canceled: { label: 'Canceled', cls: 'bg-zinc-500/15 text-zinc-500', icon: XCircle },
  scheduled: { label: 'Scheduled', cls: 'bg-violet-500/15 text-violet-300', icon: CalendarClock },
};

function Pill({ status }) {
  const s = STATUS[status] || STATUS.queued;
  const I = s.icon;
  return <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', s.cls)}><I className={cx('size-3.5', status === 'running' && 'animate-spin')} />{s.label}</span>;
}

const FILTERS = [['all', 'All'], ['active', 'Active'], ['scheduled', 'Scheduled'], ['done', 'Published'], ['failed', 'Needs attention']];

export default function Queue() {
  const { jobs, media, go } = useStore();
  const toast = useToast();
  const [filter, setFilter] = useState('all');
  const statusOf = (j) => (j.status === 'queued' && j.scheduledAt && j.scheduledAt > Date.now() ? 'scheduled' : j.status);
  const list = jobs.filter((j) => {
    const s = statusOf(j);
    return filter === 'all' || (filter === 'active' && (s === 'running' || s === 'queued')) || (filter === 'failed' && (s === 'failed' || s === 'partial')) || s === filter;
  });

  const act = async (fn, msg) => { try { await fn(); if (msg) toast(msg); } catch (e) { toast(e.message, 'error'); } };

  if (!jobs.length) {
    return <Empty icon={ListChecks} title="No posts yet" action={<Button variant="brand" onClick={() => go('create')}>Create your first post</Button>}>Everything you publish or schedule shows up here with live progress for every platform.</Empty>;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Queue</h1>
        <p className="mt-1 text-sm text-zinc-400">Live status of every post. Keep OmniPost running for scheduled posts to go out.</p>
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} className={cx('h-9 cursor-pointer rounded-full px-4 text-sm font-medium transition', filter === id ? 'bg-white text-zinc-950' : 'bg-white/[0.05] text-zinc-300 hover:bg-white/10')}>{label}</button>
        ))}
      </div>

      <div className="space-y-3">
        {list.map((j) => {
          const m = media.find((x) => x.id === j.mediaId);
          const s = statusOf(j);
          return (
            <Card key={j.id} className="pop p-4">
              <div className="flex gap-4">
                <div className="h-24 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-900">
                  {m?.thumb ? <img src={`/files/thumbs/${encodeURIComponent(m.thumb)}`} alt="" className="size-full object-cover" /> : <Image className="m-auto mt-8 size-5 text-zinc-700" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="line-clamp-1 font-semibold">{j.title || j.caption?.split('\n')[0] || m?.name || 'Untitled post'}</div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {s === 'scheduled' ? `Goes out ${new Date(j.scheduledAt).toLocaleString()} (${timeAgo(j.scheduledAt)})` : `Created ${timeAgo(j.createdAt)}`}
                      </div>
                    </div>
                    <Pill status={s} />
                  </div>

                  <div className="mt-3 space-y-2">
                    {j.targets.map((t) => (
                      <div key={t.platform} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white/[0.03] px-3 py-2 text-sm">
                        <PlatformBadge id={t.platform} size="sm" />
                        <span className="w-20 font-medium">{PLATFORM[t.platform]?.name}</span>
                        <span className={cx('min-w-0 flex-1 truncate text-xs', t.status === 'failed' ? 'text-rose-300' : 'text-zinc-400')} title={t.error || t.step}>
                          {t.status === 'failed' ? t.error : t.status === 'running' ? t.step || 'Working…' : t.status === 'done' ? 'Published' : t.status === 'canceled' ? 'Canceled' : t.step || 'Waiting'}
                        </span>
                        {t.status === 'running' && <Loader2 className="size-3.5 animate-spin text-sky-300" />}
                        {t.url && t.status === 'done' && <a href={t.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-medium text-emerald-300 hover:underline">View <ExternalLink className="size-3" /></a>}
                        {t.debugShot && t.status === 'failed' && <a href={`/files/debug/${t.debugShot}`} target="_blank" rel="noreferrer" className="text-xs text-zinc-500 hover:text-zinc-300 hover:underline">Screenshot</a>}
                        {t.status === 'failed' && <Button size="xs" variant="outline" icon={RotateCcw} onClick={() => act(() => api(`/api/jobs/${j.id}/retry`, { method: 'POST', body: { platform: t.platform } }), 'Retrying…')}>Retry</Button>}
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex justify-end gap-1">
                    {(s === 'queued' || s === 'scheduled') && <Button size="xs" variant="ghost" icon={XCircle} onClick={() => act(() => api(`/api/jobs/${j.id}/cancel`, { method: 'POST' }), 'Canceled')}>Cancel</Button>}
                    {s === 'scheduled' && <Button size="xs" variant="ghost" icon={RotateCcw} onClick={() => act(() => api(`/api/jobs/${j.id}/retry`, { method: 'POST' }))}>Post now</Button>}
                    {s !== 'running' && <Button size="xs" variant="ghost" icon={Trash2} onClick={() => act(() => api(`/api/jobs/${j.id}`, { method: 'DELETE' }))}>Remove</Button>}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
        {!list.length && <div className="py-12 text-center text-sm text-zinc-500">Nothing here.</div>}
      </div>
    </div>
  );
}
