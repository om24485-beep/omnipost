import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardPaste, Download, Eye, Heart, Link2, Repeat2, Sparkles, User } from 'lucide-react';
import { api, isUrl, proxied } from '../api.js';
import { useStore } from '../store.jsx';
import { Button, Card, Progress, cx, fmtDur, fmtNum, timeAgo, useToast } from '../ui.jsx';

const SOURCES = ['YouTube', 'Shorts', 'Instagram Reels', 'TikTok', 'X / Twitter', 'Facebook', 'Reddit', 'Vimeo', 'Twitch clips', 'Pinterest', 'Dailymotion', 'Snapchat Spotlight'];

export function creditCaption(info, autoCredit) {
  const parts = [info.title || ''];
  if (autoCredit && (info.uploader || info.url)) parts.push(`🎬 Credit: ${info.uploader ? `${info.uploader} ` : ''}${info.url ? `(${info.url})` : ''}`.trim());
  return parts.filter(Boolean).join('\n\n');
}

export default function Repost() {
  const { params, tasks, waitTask, setDraft, go, settings } = useStore();
  const toast = useToast();
  const [url, setUrl] = useState(params.url || '');
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [taskId, setTaskId] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [batch, setBatch] = useState(null);
  const inputRef = useRef(null);
  const task = taskId ? tasks[taskId] : null;

  async function inspect(u = url) {
    if (!isUrl(u)) { setError('Paste a full link, e.g. https://www.instagram.com/reel/…'); return; }
    setError('');
    setInfo(null);
    setTaskId(null);
    setLoading(true);
    try {
      const data = await api('/api/inspect', { method: 'POST', body: { url: u.trim() } });
      setInfo(data);
      if (data.kind === 'collection') setSelected(new Set());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (params.url) { setUrl(params.url); inspect(params.url); } else inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function importOne(target) {
    const { taskId: id } = await api('/api/media/import', { method: 'POST', body: { url: target.url, info: target } });
    return id;
  }

  async function importAndCompose() {
    try {
      const id = await importOne(info);
      setTaskId(id);
      const t = await waitTask(id);
      setDraft({ mediaId: t.mediaId, title: info.title, caption: creditCaption(info, settings.autoCredit), tags: [], imported: true });
      toast('Video ready — finish your post');
      go('create');
    } catch (e) {
      toast(e.message, 'error', 7000);
    }
  }

  async function importSelected() {
    const list = info.entries.filter((e) => selected.has(e.id));
    setBatch({ done: 0, total: list.length, failed: 0 });
    let failed = 0;
    for (let i = 0; i < list.length; i++) {
      try { await waitTask(await importOne(list[i])); } catch { failed++; }
      setBatch({ done: i + 1, total: list.length, failed });
    }
    toast(`Added ${list.length - failed} video${list.length - failed === 1 ? '' : 's'} to your library${failed ? ` (${failed} failed)` : ''}`, failed ? 'info' : 'success');
    setBatch(null);
    go('library');
  }

  async function pasteFromClipboard() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      setUrl(text);
      if (isUrl(text)) inspect(text);
    } catch {
      inputRef.current?.focus();
    }
  }

  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-500/20 to-orange-400/20 ring-1 ring-white/10"><Repeat2 className="size-6 text-rose-300" /></div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Repost from <span className="text-gradient">any link</span></h1>
        <p className="mt-2 text-zinc-400">Paste a video, profile, channel or playlist link. We fetch it in the best available quality — no keys needed.</p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); inspect(); }} className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-zinc-900/70 p-2 shadow-2xl shadow-black/30 sm:flex-row">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-zinc-500" />
          <input
            ref={inputRef}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onPaste={(e) => { const t = e.clipboardData.getData('text').trim(); if (isUrl(t)) { e.preventDefault(); setUrl(t); inspect(t); } }}
            placeholder="https://www.youtube.com/shorts/…"
            className="h-12 w-full rounded-xl bg-transparent pr-3 pl-12 text-[15px] outline-none placeholder:text-zinc-600"
          />
        </div>
        <Button type="button" variant="ghost" size="lg" icon={ClipboardPaste} onClick={pasteFromClipboard} className="sm:px-4">Paste</Button>
        <Button type="submit" variant="brand" size="lg" loading={loading} icon={Sparkles}>Fetch</Button>
      </form>

      <div className="mt-4 flex flex-wrap justify-center gap-1.5">
        {SOURCES.map((s) => <span key={s} className="rounded-full bg-white/[0.04] px-2.5 py-1 text-xs text-zinc-400">{s}</span>)}
        <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-xs text-zinc-500">+1,800 more</span>
      </div>

      {error && (
        <div className="pop mt-6 flex gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/[0.07] p-4 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <div>{error}</div>
            {/login|sign in|private|cookies|rate/i.test(error) && <div className="mt-1 text-rose-200/70">Tip: connect that platform on the Accounts page — OmniPost can then use your session to fetch it.</div>}
          </div>
        </div>
      )}

      {loading && (
        <Card className="mt-8 flex gap-5 p-5">
          <div className="skeleton aspect-[9/14] w-36 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-3 pt-2"><div className="skeleton h-5 w-3/4 rounded" /><div className="skeleton h-4 w-1/3 rounded" /><div className="skeleton h-4 w-1/2 rounded" /></div>
        </Card>
      )}

      {info?.kind === 'video' && (
        <Card className="pop mt-8 overflow-hidden">
          <div className="grid gap-0 sm:grid-cols-[220px_1fr]">
            <div className="relative aspect-video bg-black sm:aspect-auto">
              {info.thumbnail && <img src={proxied(info.thumbnail)} referrerPolicy="no-referrer" alt="" className="absolute inset-0 size-full object-cover" />}
              {info.duration ? <span className="absolute right-2 bottom-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs">{fmtDur(info.duration)}</span> : null}
            </div>
            <div className="p-6">
              <div className="text-xs font-semibold tracking-wide text-rose-300 uppercase">{info.platform}</div>
              <h2 className="mt-1.5 text-xl leading-snug font-bold">{info.title}</h2>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-400">
                {info.uploader && <span className="flex items-center gap-1.5"><User className="size-4" />{info.uploader}</span>}
                {info.views != null && <span className="flex items-center gap-1.5"><Eye className="size-4" />{fmtNum(info.views)}</span>}
                {info.likes != null && <span className="flex items-center gap-1.5"><Heart className="size-4" />{fmtNum(info.likes)}</span>}
                {info.timestamp && <span>{timeAgo(info.timestamp)}</span>}
                {info.width && <span>{info.width}×{info.height}</span>}
              </div>
              {info.description && <p className="mt-3 line-clamp-3 text-sm text-zinc-500">{info.description}</p>}

              {task && task.status !== 'error' ? (
                <div className="mt-6">
                  <div className="mb-2 flex justify-between text-sm"><span className="text-zinc-300">{task.message || 'Working…'}</span><span className="text-zinc-500">{Math.round(task.percent || 0)}%</span></div>
                  <Progress value={task.percent} />
                </div>
              ) : (
                <div className="mt-6 flex flex-wrap gap-2">
                  <Button variant="brand" size="lg" icon={Repeat2} onClick={importAndCompose}>Repost to my accounts</Button>
                  <Button variant="outline" size="lg" icon={Download} onClick={async () => { try { await waitTask(await importOne(info)); toast('Saved to your library'); } catch (e) { toast(e.message, 'error'); } }}>Save to library</Button>
                </div>
              )}
              <p className="mt-4 text-xs text-zinc-500">Only repost content you own or have permission to use. OmniPost adds a credit line automatically{settings.autoCredit ? '' : ' (turned off in settings)'}.</p>
            </div>
          </div>
        </Card>
      )}

      {info?.kind === 'collection' && (
        <div className="pop mt-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">{info.title}</h2>
              <p className="text-sm text-zinc-400">{info.entries.length} videos{info.uploader ? ` · ${info.uploader}` : ''}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelected(selected.size === info.entries.length ? new Set() : new Set(info.entries.map((e) => e.id)))}>
                {selected.size === info.entries.length ? 'Clear' : 'Select all'}
              </Button>
              <Button variant="brand" size="sm" icon={Download} disabled={!selected.size || !!batch} onClick={importSelected}>
                Import {selected.size || ''}
              </Button>
            </div>
          </div>
          {batch && <div className="mb-4"><div className="mb-1.5 text-sm text-zinc-400">Importing {batch.done}/{batch.total}…</div><Progress value={(batch.done / batch.total) * 100} /></div>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {info.entries.map((e) => (
              <div key={e.id} className={cx('group relative overflow-hidden rounded-xl bg-zinc-900 ring-2 transition', selected.has(e.id) ? 'ring-rose-500' : 'ring-transparent hover:ring-white/15')}>
                <button className="block w-full cursor-pointer text-left" onClick={() => toggle(e.id)}>
                  <div className="relative aspect-video bg-black">
                    {e.thumbnail && <img src={proxied(e.thumbnail)} referrerPolicy="no-referrer" alt="" loading="lazy" className="size-full object-cover" />}
                    {selected.has(e.id) && <CheckCircle2 className="absolute top-2 left-2 size-6 fill-rose-500 text-white" />}
                    {e.duration ? <span className="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1 text-[11px]">{fmtDur(e.duration)}</span> : null}
                  </div>
                  <div className="p-2.5"><p className="line-clamp-2 text-xs font-medium">{e.title}</p></div>
                </button>
                <button onClick={() => { setUrl(e.url); inspect(e.url); }} className="absolute top-2 right-2 cursor-pointer rounded-lg bg-black/60 px-2 py-1 text-[11px] font-medium opacity-0 backdrop-blur transition group-hover:opacity-100">Repost</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
