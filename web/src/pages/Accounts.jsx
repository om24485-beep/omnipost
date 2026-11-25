import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Globe, LogOut, RefreshCw, ShieldCheck, Terminal, Wrench } from 'lucide-react';
import { api } from '../api.js';
import { useStore } from '../store.jsx';
import { Avatar, Button, Card, PLATFORM, PlatformBadge, Spinner, Toggle, cx, timeAgo, useToast } from '../ui.jsx';

const BLURB = {
  youtube: 'Videos & Shorts from your channel. Posts through YouTube Studio.',
  instagram: 'Reels and video posts. Publishes Reels from your account.',
  tiktok: 'Every TikTok on your profile. Posts through TikTok Studio.',
};

function PlatformCard({ p }) {
  const { accounts, tasks, feeds, syncing, syncFeed } = useStore();
  const toast = useToast();
  const acc = accounts[p.id];
  const [taskId, setTaskId] = useState(null);
  const task = taskId ? tasks[taskId] : Object.values(tasks).find((t) => t.kind === 'connect' && t.platform === p.id && t.status === 'waiting' && !t.silent);
  const waiting = task && task.status === 'waiting';
  const feed = feeds[p.id];

  useEffect(() => {
    if (task?.status === 'done' && taskId) { toast(`${p.name} connected`); setTaskId(null); }
    if (task?.status === 'error' && taskId) { if (task.error !== 'Canceled') toast(task.error, 'error', 7000); setTaskId(null); }
  }, [task?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function connect() {
    try {
      const { taskId: id } = await api(`/api/accounts/${p.id}/connect`, { method: 'POST' });
      setTaskId(id);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function disconnect(signOut) {
    if (!window.confirm(signOut ? `Disconnect ${p.name} and sign out of it in the OmniPost browser?` : `Disconnect ${p.name}? (You stay signed in inside the OmniPost browser.)`)) return;
    await api(`/api/accounts/${p.id}${signOut ? '?signout=1' : ''}`, { method: 'DELETE' });
    toast(`${p.name} disconnected`);
  }

  return (
    <Card className={cx('relative overflow-hidden p-5', acc && 'ring-1 ring-white/[0.04]')}>
      <div className={cx('pointer-events-none absolute -top-16 -right-16 size-40 rounded-full opacity-25 blur-3xl', PLATFORM[p.id].bg)} />
      <div className="relative flex items-start gap-4">
        {acc ? (
          <div className="relative">
            <Avatar src={acc.avatar} name={acc.displayName} className="size-14" />
            <PlatformBadge id={p.id} size="sm" className="absolute -right-1 -bottom-1 ring-2 ring-zinc-900" />
          </div>
        ) : <PlatformBadge id={p.id} size="lg" className="size-14 [&_svg]:size-6" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{acc ? acc.displayName : p.name}</h3>
            {acc && !acc.needsReconnect && <CheckCircle2 className="size-4 text-emerald-400" />}
          </div>
          <p className="mt-0.5 truncate text-sm text-zinc-400">{acc ? `@${acc.username.replace(/^@/, '')} · ${p.name}` : BLURB[p.id]}</p>
          {acc && (
            <p className="mt-1 text-xs text-zinc-500">
              {feed?.items ? `${feed.items.length} posts synced` : 'Not synced yet'}{feed?.syncedAt ? ` · ${timeAgo(feed.syncedAt)}` : ''}
            </p>
          )}
        </div>
      </div>

      {acc?.needsReconnect && (
        <div className="relative mt-4 flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-200"><AlertTriangle className="size-4" />Session expired — reconnect to keep posting.</div>
      )}

      {waiting && (
        <div className="pop relative mt-4 rounded-xl border border-sky-400/20 bg-sky-400/[0.06] p-3 text-sm text-sky-100">
          <div className="flex items-center gap-2"><Spinner />{task.message}</div>
          <div className="mt-1 text-xs text-sky-200/60">Sign in like you normally would (2FA works). OmniPost never sees your password.</div>
          <Button size="xs" variant="ghost" className="mt-2 -ml-2" onClick={() => api(`/api/tasks/${task.id}/cancel`, { method: 'POST' })}>Cancel</Button>
        </div>
      )}

      <div className="relative mt-5 flex flex-wrap gap-2">
        {!acc || acc.needsReconnect ? (
          <Button variant="brand" size="sm" loading={waiting} onClick={connect}>{acc ? 'Reconnect' : `Connect ${p.name}`}</Button>
        ) : (
          <>
            <Button variant="outline" size="sm" icon={RefreshCw} loading={syncing.includes(p.id)} onClick={() => syncFeed(p.id)}>Sync</Button>
            <a href={acc.profileUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-zinc-300 hover:bg-white/[0.06]"><ExternalLink className="size-3.5" />Profile</a>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => disconnect(false)}>Disconnect</Button>
            <Button variant="ghost" size="sm" icon={LogOut} onClick={() => disconnect(true)} title="Disconnect and sign out" />
          </>
        )}
      </div>
    </Card>
  );
}

export default function Accounts() {
  const { platforms, settings, updateSettings } = useStore();
  const toast = useToast();
  const [sys, setSys] = useState(null);
  const [updating, setUpdating] = useState(false);
  useEffect(() => { api('/api/system').then(setSys).catch(() => {}); }, []);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Accounts</h1>
        <p className="mt-1 text-sm text-zinc-400">Connect once. OmniPost opens the real site in its own browser window — you sign in there, no API keys or passwords stored here.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {platforms.map((p) => <PlatformCard key={p.id} p={p} />)}
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-2 flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-rose-300" />Preferences</h2>
          <div className="divide-y divide-white/[0.06]">
            <Toggle checked={!!settings.showBrowser} onChange={(v) => updateSettings({ showBrowser: v })} label="Show the browser while posting" hint="Watch uploads happen and step in if a site asks for verification. Recommended." />
            <Toggle checked={!!settings.autoCredit} onChange={(v) => updateSettings({ autoCredit: v })} label="Credit the original creator on reposts" hint="Adds “Credit: creator (link)” to the caption of imported videos." />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><Wrench className="size-4 text-rose-300" />Engine</h2>
          {sys ? (
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-4"><dt className="text-zinc-400">Browser</dt><dd className="truncate text-right text-zinc-200" title={sys.browser.executable}>{sys.browser.executable ? sys.browser.executable.split(/[\\/]/).pop() : 'Not found'} {sys.browser.running && <span className="text-emerald-400">· running</span>}</dd></div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-zinc-400">yt-dlp</dt>
                <dd className="flex items-center gap-2 text-zinc-200">{sys.ytdlp || 'installing…'}
                  <Button size="xs" variant="outline" loading={updating} onClick={async () => { setUpdating(true); try { const r = await api('/api/system/update-ytdlp', { method: 'POST' }); setSys((s) => ({ ...s, ytdlp: r.ytdlp })); toast(`yt-dlp ${r.ytdlp}`); } catch (e) { toast(e.message, 'error'); } finally { setUpdating(false); } }}>Update</Button>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4"><dt className="text-zinc-400">ffmpeg</dt><dd className="text-zinc-200">{sys.ffmpeg ? 'bundled' : 'missing'}</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-zinc-400">Data folder</dt><dd className="truncate text-right font-mono text-xs text-zinc-400" title={sys.dataDir}>{sys.dataDir}</dd></div>
            </dl>
          ) : <Spinner className="text-zinc-500" />}
          <div className="mt-4 rounded-xl bg-black/40 p-3 font-mono text-xs text-zinc-400">
            <div className="mb-1 flex items-center gap-1.5 font-sans text-zinc-500"><Terminal className="size-3.5" />Automate from the terminal or an AI agent</div>
            npm run cli -- repost &lt;url&gt; --to yt,ig,tt --wait
          </div>
        </Card>
      </div>

      <p className="mt-6 flex items-center gap-2 text-xs text-zinc-500"><Globe className="size-3.5" />More platforms can be added as a single adapter file in <code className="text-zinc-400">server/platforms/</code>.</p>
    </div>
  );
}
