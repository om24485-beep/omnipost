import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarClock, Check, Film, Hash, Link2, RectangleVertical, Repeat2, Send, Trash2, UploadCloud, X } from 'lucide-react';
import { api, uploadFile } from '../api.js';
import { useStore } from '../store.jsx';
import { Button, Card, PLATFORM, PlatformBadge, Progress, Avatar, cx, fmtBytes, fmtDur, useToast } from '../ui.jsx';

function Dropzone({ onFile, uploading }) {
  const [over, setOver] = useState(false);
  const input = useRef(null);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
      onClick={() => input.current?.click()}
      className={cx('flex aspect-[4/5] max-h-[460px] w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition',
        over ? 'border-rose-400 bg-rose-500/[0.06]' : 'border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]')}
    >
      <input ref={input} type="file" accept="video/*,.mkv" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      {uploading != null ? (
        <div className="w-full max-w-xs">
          <UploadCloud className="mx-auto mb-3 size-8 animate-bounce text-rose-300" />
          <div className="mb-2 text-sm text-zinc-300">Uploading… {Math.round(uploading)}%</div>
          <Progress value={uploading} />
        </div>
      ) : (
        <>
          <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-500/20 to-orange-400/20 ring-1 ring-white/10"><UploadCloud className="size-6 text-rose-200" /></div>
          <div className="font-semibold">Drop a video here</div>
          <div className="mt-1 text-sm text-zinc-500">or click to browse · MP4, MOV, WebM, MKV</div>
        </>
      )}
    </div>
  );
}

function TagInput({ tags, onChange }) {
  const [v, setV] = useState('');
  const add = (raw) => {
    const next = raw.split(/[\s,]+/).map((t) => t.replace(/^#/, '').trim()).filter(Boolean);
    if (next.length) onChange([...new Set([...tags, ...next])].slice(0, 30));
    setV('');
  };
  return (
    <div className="input flex min-h-11 flex-wrap items-center gap-1.5 py-1.5">
      <Hash className="size-4 text-zinc-500" />
      {tags.map((t) => (
        <span key={t} className="flex items-center gap-1 rounded-lg bg-rose-500/15 px-2 py-0.5 text-xs font-medium text-rose-200">
          #{t}
          <button type="button" className="cursor-pointer" onClick={() => onChange(tags.filter((x) => x !== t))}><X className="size-3" /></button>
        </span>
      ))}
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (['Enter', ',', ' '].includes(e.key) && v.trim()) { e.preventDefault(); add(v); }
          if (e.key === 'Backspace' && !v && tags.length) onChange(tags.slice(0, -1));
        }}
        onBlur={() => v.trim() && add(v)}
        placeholder={tags.length ? '' : 'Add hashtags — press Enter'}
        className="min-w-24 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-zinc-500"
      />
    </div>
  );
}

const localInputValue = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export default function Create() {
  const { media, accounts, platforms, draft, setDraft, go, waitTask, tasks } = useStore();
  const toast = useToast();
  const connected = platforms.filter((p) => accounts[p.id]);
  const [mediaId, setMediaId] = useState(draft?.mediaId || null);
  const [title, setTitle] = useState(draft?.title || '');
  const [caption, setCaption] = useState(draft?.caption || '');
  const [tags, setTags] = useState(draft?.tags || []);
  const [targets, setTargets] = useState(() => connected.map((p) => p.id));
  const [tab, setTab] = useState('all');
  const [overrides, setOverrides] = useState({});
  const [visibility, setVisibility] = useState('public');
  const [when, setWhen] = useState('now');
  const [at, setAt] = useState(() => localInputValue(new Date(Date.now() + 3600e3)));
  const [rights, setRights] = useState(!draft?.imported);
  const [uploading, setUploading] = useState(null);
  const [verticalTask, setVerticalTask] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (draft) setDraft(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const m = media.find((x) => x.id === mediaId);
  const imported = m?.source?.type === 'import';
  const horizontal = m && m.width && m.height && m.width > m.height;
  const wantsVertical = targets.some((t) => t !== 'youtube');
  const vt = verticalTask ? tasks[verticalTask] : null;

  useEffect(() => { setRights(!imported); }, [mediaId, imported]);

  const textFor = (pid) => (overrides[pid]?.caption ?? caption);
  const fullText = (pid) => {
    const base = textFor(pid).trim();
    const missing = tags.map((t) => `#${t}`).filter((t) => !base.toLowerCase().includes(t.toLowerCase()));
    return [base, missing.join(' ')].filter(Boolean).join('\n\n');
  };
  const limitOf = (pid) => platforms.find((p) => p.id === pid)?.limits?.caption || 2200;
  const overLimit = targets.filter((pid) => fullText(pid).length > limitOf(pid));

  async function onFile(file) {
    setUploading(0);
    try {
      const rec = await uploadFile(file, setUploading);
      setMediaId(rec.id);
      if (!caption) setCaption('');
      toast('Video uploaded');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setUploading(null);
    }
  }

  async function makeVertical() {
    try {
      const { taskId } = await api(`/api/media/${m.id}/vertical`, { method: 'POST' });
      setVerticalTask(taskId);
      const t = await waitTask(taskId);
      setMediaId(t.mediaId);
      toast('Converted to 9:16 — ready for Shorts, Reels & TikTok');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setVerticalTask(null);
    }
  }

  async function submit() {
    setSubmitting(true);
    try {
      const perPlatform = Object.fromEntries(Object.entries(overrides).filter(([pid, o]) => targets.includes(pid) && o.caption != null));
      await api('/api/jobs', {
        method: 'POST',
        body: { mediaId, platforms: targets, title, caption, tags, perPlatform, visibility, scheduledAt: when === 'later' ? new Date(at).toISOString() : null },
      });
      toast(when === 'later' ? 'Post scheduled' : `Publishing to ${targets.length} platform${targets.length > 1 ? 's' : ''}…`);
      go('queue');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const recent = useMemo(() => media.slice(0, 8), [media]);
  const canSubmit = m && targets.length && rights && !overLimit.length && !vt && (when === 'now' || new Date(at) > new Date());

  if (!connected.length) {
    return (
      <Card className="mx-auto max-w-lg p-10 text-center">
        <Link2 className="mx-auto mb-4 size-8 text-zinc-500" />
        <h2 className="text-xl font-bold">Connect an account to start posting</h2>
        <p className="mt-2 text-sm text-zinc-400">Link YouTube, Instagram or TikTok first. It's a one-time sign-in.</p>
        <Button variant="brand" className="mt-6" onClick={() => go('accounts')}>Connect accounts</Button>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Create a post</h1>
        <p className="mt-1 text-sm text-zinc-400">One video, every platform. Customize per platform if you like.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,400px)_1fr]">
        {/* ---------------- media */}
        <div className="space-y-4">
          {m ? (
            <Card className="overflow-hidden">
              <div className={cx('relative bg-black', horizontal ? 'aspect-video' : 'mx-auto aspect-[9/16] max-h-[520px]')}>
                <video key={m.file} src={`/files/media/${encodeURIComponent(m.file)}`} poster={m.thumb ? `/files/thumbs/${encodeURIComponent(m.thumb)}` : undefined} controls playsInline className="size-full object-contain" />
              </div>
              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{m.name}</div>
                    <div className="mt-0.5 text-xs text-zinc-500">{fmtDur(m.duration)} · {m.width}×{m.height} · {fmtBytes(m.size)}</div>
                  </div>
                  <button onClick={() => setMediaId(null)} className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-white" title="Remove"><Trash2 className="size-4" /></button>
                </div>
                {imported && <div className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-zinc-400"><Repeat2 className="size-3.5" />From {m.source.uploader || m.source.platform || 'the web'}</div>}
                {vt ? (
                  <div><div className="mb-1.5 text-xs text-zinc-400">Reframing to 9:16… {Math.round(vt.percent || 0)}%</div><Progress value={vt.percent} /></div>
                ) : horizontal && wantsVertical ? (
                  <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-xs text-amber-100">
                    <div className="flex gap-2"><AlertTriangle className="size-4 shrink-0 text-amber-400" />This video is horizontal. Reels and TikTok will crop it.</div>
                    <Button size="sm" variant="outline" icon={RectangleVertical} className="mt-2.5" onClick={makeVertical}>Make it 9:16 (blurred fill)</Button>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" icon={RectangleVertical} onClick={makeVertical} className="-ml-2">Create a 9:16 version</Button>
                )}
              </div>
            </Card>
          ) : (
            <Dropzone onFile={onFile} uploading={uploading} />
          )}

          {!m && recent.length > 0 && (
            <div>
              <div className="label">Or pick from your library</div>
              <div className="grid grid-cols-4 gap-2">
                {recent.map((x) => (
                  <button key={x.id} onClick={() => setMediaId(x.id)} className="relative aspect-[3/4] cursor-pointer overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-white/5 hover:ring-white/30">
                    {x.thumb ? <img src={`/files/thumbs/${encodeURIComponent(x.thumb)}`} alt="" className="size-full object-cover" /> : <Film className="m-auto size-5 text-zinc-600" />}
                    <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 text-[10px]">{fmtDur(x.duration)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {!m && <Button variant="outline" className="w-full" icon={Repeat2} onClick={() => go('repost')}>Import from a link instead</Button>}
        </div>

        {/* ---------------- details */}
        <div className="space-y-5">
          <Card className="p-5">
            <div className="label">Publish to</div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2">
              {platforms.map((p) => {
                const acc = accounts[p.id];
                const on = targets.includes(p.id);
                return (
                  <button
                    key={p.id}
                    disabled={!acc}
                    onClick={() => setTargets((t) => (on ? t.filter((x) => x !== p.id) : [...t, p.id]))}
                    className={cx('relative flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition disabled:cursor-default',
                      on ? `border-transparent bg-white/[0.07] ring-2 ${PLATFORM[p.id].ring}` : 'border-white/[0.07] hover:bg-white/[0.04]', !acc && 'opacity-50')}
                  >
                    <div className="relative">
                      {acc ? <Avatar src={acc.avatar} name={acc.username} className="size-9" /> : <PlatformBadge id={p.id} size="lg" className="size-9" />}
                      {acc && <PlatformBadge id={p.id} size="sm" className="absolute -right-1 -bottom-1 ring-2 ring-zinc-900" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{p.name}</div>
                      <div className="truncate text-xs text-zinc-500">{acc ? `@${acc.username.replace(/^@/, '')}` : 'Not connected'}</div>
                    </div>
                    {on && <span className="grid size-5 place-items-center rounded-full bg-white"><Check className="size-3.5 text-zinc-950" /></span>}
                    {!acc && <span onClick={(e) => { e.stopPropagation(); go('accounts'); }} className="text-xs font-medium text-rose-300 hover:underline">Connect</span>}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            {targets.includes('youtube') && (
              <div>
                <label className="label flex justify-between"><span>YouTube title</span><span className={cx(title.length > 100 && 'text-rose-400')}>{title.length}/100</span></label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Defaults to the first line of your caption" className="input" maxLength={100} />
              </div>
            )}

            <div>
              <div className="mb-2 flex items-center gap-1 overflow-x-auto">
                {['all', ...targets].map((t) => (
                  <button key={t} onClick={() => setTab(t)} className={cx('flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition', tab === t ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-200')}>
                    {t !== 'all' && <PlatformBadge id={t} size="sm" className="size-4 [&_svg]:size-2.5" />}
                    {t === 'all' ? 'Caption' : PLATFORM[t].name}
                    {t !== 'all' && overrides[t]?.caption != null && <span className="size-1.5 rounded-full bg-rose-400" />}
                  </button>
                ))}
              </div>
              {tab === 'all' ? (
                <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={6} placeholder="Write a caption… it's used on every platform unless you customize one." className="input resize-y leading-relaxed" />
              ) : (
                <div>
                  <textarea
                    value={textFor(tab)}
                    onChange={(e) => setOverrides((o) => ({ ...o, [tab]: { ...o[tab], caption: e.target.value } }))}
                    rows={6}
                    className="input resize-y leading-relaxed"
                  />
                  <div className="mt-1.5 flex justify-between text-xs text-zinc-500">
                    <span>{overrides[tab]?.caption != null ? `Custom caption for ${PLATFORM[tab].name}` : `Using the shared caption — edit to customize for ${PLATFORM[tab].name}`}</span>
                    {overrides[tab]?.caption != null && <button className="cursor-pointer text-rose-300 hover:underline" onClick={() => setOverrides((o) => { const n = { ...o }; delete n[tab]; return n; })}>Reset</button>}
                  </div>
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-zinc-500">
                {targets.map((pid) => (
                  <span key={pid} className={cx('flex items-center gap-1', fullText(pid).length > limitOf(pid) && 'text-rose-400')}>
                    <PlatformBadge id={pid} size="sm" className="size-3.5 [&_svg]:size-2" />{fullText(pid).length}/{limitOf(pid)}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div className="label">Hashtags</div>
              <TagInput tags={tags} onChange={setTags} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {targets.includes('youtube') && (
                <div>
                  <div className="label">YouTube visibility</div>
                  <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className="input cursor-pointer">
                    <option value="public">Public</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="private">Private</option>
                  </select>
                </div>
              )}
              <div>
                <div className="label">When</div>
                <div className="flex gap-2">
                  <div className="flex rounded-xl bg-white/[0.04] p-1">
                    {[['now', 'Now'], ['later', 'Schedule']].map(([v, l]) => (
                      <button key={v} onClick={() => setWhen(v)} className={cx('cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium', when === v ? 'bg-white text-zinc-950' : 'text-zinc-400')}>{l}</button>
                    ))}
                  </div>
                  {when === 'later' && <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="input py-2 [color-scheme:dark]" />}
                </div>
              </div>
            </div>
          </Card>

          {imported && (
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 text-sm">
              <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-0.5 size-4 accent-rose-500" />
              <span className="text-zinc-300">I own this video or have the creator's permission to repost it. <span className="text-zinc-500">Reposting others' content without permission can get your account restricted.</span></span>
            </label>
          )}

          <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
            {overLimit.length > 0 && <span className="text-sm text-rose-400">Caption too long for {overLimit.map((p) => PLATFORM[p].name).join(', ')}</span>}
            <Button variant="brand" size="lg" icon={when === 'later' ? CalendarClock : Send} disabled={!canSubmit} loading={submitting} onClick={submit}>
              {when === 'later' ? 'Schedule post' : `Publish to ${targets.length || 0} platform${targets.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
