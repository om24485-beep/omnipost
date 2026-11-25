import { useRef, useState } from 'react';
import { Download, Film, RectangleVertical, Repeat2, Send, Trash2, UploadCloud } from 'lucide-react';
import { api, uploadFile } from '../api.js';
import { useStore } from '../store.jsx';
import { Button, Card, Empty, Progress, cx, fmtBytes, fmtDur, timeAgo, useToast } from '../ui.jsx';

export default function Library() {
  const { media, tasks, go, setDraft, waitTask } = useStore();
  const toast = useToast();
  const input = useRef(null);
  const [uploads, setUploads] = useState({});
  const [busy, setBusy] = useState({});
  const running = Object.values(tasks).filter((t) => (t.kind === 'import' || t.kind === 'vertical') && t.status === 'running');

  async function onFiles(files) {
    for (const f of files) {
      const key = `${f.name}-${f.size}`;
      setUploads((u) => ({ ...u, [key]: { name: f.name, pct: 0 } }));
      try {
        await uploadFile(f, (pct) => setUploads((u) => ({ ...u, [key]: { name: f.name, pct } })));
      } catch (e) {
        toast(`${f.name}: ${e.message}`, 'error');
      }
      setUploads((u) => { const n = { ...u }; delete n[key]; return n; });
    }
  }

  async function vertical(m) {
    setBusy((b) => ({ ...b, [m.id]: true }));
    try {
      const { taskId } = await api(`/api/media/${m.id}/vertical`, { method: 'POST' });
      await waitTask(taskId);
      toast('9:16 version added to your library');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy((b) => ({ ...b, [m.id]: false }));
    }
  }

  async function remove(m) {
    if (!window.confirm(`Delete "${m.name}" from your library? This removes the file from this computer.`)) return;
    await api(`/api/media/${m.id}`, { method: 'DELETE' });
    toast('Deleted');
  }

  const post = (m) => {
    const s = m.source || {};
    setDraft({ mediaId: m.id, title: s.title || '', caption: s.title ? `${s.title}${s.uploader ? `\n\n🎬 Credit: ${s.uploader}${s.url ? ` (${s.url})` : ''}` : ''}` : '', imported: s.type === 'import' });
    go('create');
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Library</h1>
          <p className="mt-1 text-sm text-zinc-400">{media.length} videos stored on this computer · {fmtBytes(media.reduce((s, m) => s + (m.size || 0), 0)) || '0 B'}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" icon={Repeat2} onClick={() => go('repost')}>Import link</Button>
          <Button variant="primary" icon={UploadCloud} onClick={() => input.current?.click()}>Upload</Button>
          <input ref={input} type="file" accept="video/*,.mkv" multiple hidden onChange={(e) => { onFiles([...e.target.files]); e.target.value = ''; }} />
        </div>
      </div>

      {(running.length > 0 || Object.keys(uploads).length > 0) && (
        <Card className="mb-5 space-y-3 p-4">
          {Object.entries(uploads).map(([k, u]) => (
            <div key={k}><div className="mb-1.5 flex justify-between text-xs"><span className="truncate text-zinc-300">Uploading {u.name}</span><span className="text-zinc-500">{Math.round(u.pct)}%</span></div><Progress value={u.pct} /></div>
          ))}
          {running.map((t) => (
            <div key={t.id}><div className="mb-1.5 flex justify-between gap-4 text-xs"><span className="truncate text-zinc-300">{t.title || t.url} — {t.message}</span><span className="text-zinc-500">{Math.round(t.percent || 0)}%</span></div><Progress value={t.percent} /></div>
          ))}
        </Card>
      )}

      {media.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {media.map((m) => (
            <Card key={m.id} className="group pop overflow-hidden">
              <div className="relative aspect-[4/5] bg-black">
                {m.thumb ? <img src={`/files/thumbs/${encodeURIComponent(m.thumb)}`} alt="" loading="lazy" className="size-full object-cover" /> : <Film className="absolute inset-0 m-auto size-8 text-zinc-700" />}
                <span className="absolute right-2 bottom-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px]">{fmtDur(m.duration)}</span>
                <span className={cx('absolute top-2 left-2 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase backdrop-blur',
                  m.source?.type === 'import' ? 'bg-fuchsia-500/30 text-fuchsia-100' : 'bg-black/50 text-zinc-300')}>
                  {m.source?.type === 'import' ? (m.source.platform || 'Imported') : 'Upload'}
                </span>
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition group-hover:opacity-100">
                  <Button size="sm" variant="brand" icon={Send} onClick={() => post(m)}>Post</Button>
                </div>
              </div>
              <div className="p-3">
                <div className="truncate text-sm font-medium" title={m.name}>{m.name}</div>
                <div className="mt-0.5 text-xs text-zinc-500">{m.width}×{m.height} · {fmtBytes(m.size)} · {timeAgo(m.createdAt)}</div>
                <div className="mt-2.5 flex gap-1">
                  <Button size="xs" variant="ghost" icon={Send} onClick={() => post(m)} className="md:hidden">Post</Button>
                  <Button size="xs" variant="ghost" icon={RectangleVertical} loading={busy[m.id]} onClick={() => vertical(m)} title="Make a 9:16 version">9:16</Button>
                  <a href={`/files/media/${encodeURIComponent(m.file)}`} download={m.name} className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-zinc-300 hover:bg-white/[0.06]" title="Download"><Download className="size-4" /></a>
                  <Button size="xs" variant="ghost" icon={Trash2} onClick={() => remove(m)} className="ml-auto hover:text-rose-300" title="Delete" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Empty icon={Film} title="Your library is empty" action={<div className="flex gap-2"><Button variant="brand" icon={UploadCloud} onClick={() => input.current?.click()}>Upload a video</Button><Button variant="outline" icon={Repeat2} onClick={() => go('repost')}>Import a link</Button></div>}>
          Upload videos from your computer or import them from any link. They're kept here, ready to post anywhere.
        </Empty>
      )}
    </div>
  );
}
