import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

const ROUTES = ['feed', 'create', 'repost', 'library', 'queue', 'accounts'];
const routeFromHash = () => {
  const r = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return ROUTES.includes(r) ? r : 'feed';
};

export function StoreProvider({ children, onSignedOut }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [platforms, setPlatforms] = useState([]);
  const [accounts, setAccounts] = useState({});
  const [media, setMedia] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [tasks, setTasks] = useState({});
  const [settings, setSettings] = useState({});
  const [feeds, setFeeds] = useState({});
  const [syncing, setSyncing] = useState([]);
  const [route, setRoute] = useState(routeFromHash);
  const [params, setParams] = useState({});
  const [draft, setDraft] = useState(null);
  const listeners = useRef(new Set());
  const feedTimer = useRef(null);

  const loadFeed = useCallback(() => {
    clearTimeout(feedTimer.current);
    feedTimer.current = setTimeout(() => api('/api/feed').then((f) => { setFeeds(f.feeds); setSyncing(f.syncing); }).catch(() => {}), 150);
  }, []);

  useEffect(() => {
    let es;
    api('/api/bootstrap').then((b) => {
      setUser(b.user);
      setPlatforms(b.platforms);
      setAccounts(b.accounts);
      setMedia(b.media);
      setJobs(b.jobs);
      setSettings(b.settings);
      setTasks(Object.fromEntries(b.tasks.map((t) => [t.id, t])));
      setReady(true);
    }).catch((e) => e.status === 401 && onSignedOut());
    loadFeed();
    es = new EventSource('/api/events');
    es.onmessage = (ev) => {
      const { type, data } = JSON.parse(ev.data);
      if (type === 'accounts') setAccounts(data);
      else if (type === 'media') setMedia(data);
      else if (type === 'settings') setSettings(data);
      else if (type === 'feed') loadFeed();
      else if (type === 'job') setJobs((l) => (l.some((j) => j.id === data.id) ? l.map((j) => (j.id === data.id ? data : j)) : [data, ...l]));
      else if (type === 'job:removed') setJobs((l) => l.filter((j) => j.id !== data.id));
      else if (type === 'task') {
        setTasks((m) => ({ ...m, [data.id]: data }));
        for (const fn of listeners.current) fn(data);
      }
    };
    return () => es?.close();
  }, [loadFeed, onSignedOut]);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((name, p = {}) => {
    setParams(p);
    if (routeFromHash() === name) setRoute(name);
    window.location.hash = `/${name}`;
    window.scrollTo({ top: 0 });
  }, []);

  /** Resolves when a server task finishes (import, conversion, connect). */
  const waitTask = useCallback((id) => new Promise((resolve, reject) => {
    const check = (t) => {
      if (t.id !== id) return;
      if (t.status === 'done') { listeners.current.delete(check); resolve(t); }
      if (t.status === 'error') { listeners.current.delete(check); reject(new Error(t.error)); }
    };
    listeners.current.add(check);
    api(`/api/tasks/${id}`).then(check).catch(() => {});
  }), []);

  const syncFeed = useCallback((platform) => {
    setSyncing((s) => [...new Set([...s, ...(platform ? [platform] : Object.keys(accounts))])]);
    return api('/api/feed/sync', { method: 'POST', body: platform ? { platform } : {} });
  }, [accounts]);

  const updateSettings = useCallback(async (patch) => setSettings(await api('/api/settings', { method: 'PATCH', body: patch })), []);

  const value = useMemo(() => ({
    ready, user, platforms, accounts, media, jobs, tasks, settings, feeds, syncing, route, params, draft,
    go, setDraft, waitTask, syncFeed, updateSettings, loadFeed, onSignedOut,
  }), [ready, user, platforms, accounts, media, jobs, tasks, settings, feeds, syncing, route, params, draft, go, waitTask, syncFeed, updateSettings, loadFeed, onSignedOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
