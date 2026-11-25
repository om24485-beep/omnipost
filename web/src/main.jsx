import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { api } from './api.js';
import { ToastProvider, Spinner } from './ui.jsx';
import { StoreProvider } from './store.jsx';
import App from './App.jsx';
import Login from './pages/Login.jsx';

function Root() {
  const [me, setMe] = useState(null);
  const refresh = useCallback(() => api('/api/me').then(setMe).catch(() => setMe({ user: null })), []);
  useEffect(() => { refresh(); }, [refresh]);
  const signedOut = useCallback(() => setMe((m) => ({ ...m, user: null })), []);

  if (!me) return <div className="grid h-full place-items-center"><Spinner className="size-6 text-zinc-500" /></div>;
  if (!me.user) return <Login info={me} onDone={refresh} />;
  return (
    <StoreProvider onSignedOut={signedOut}>
      <App />
    </StoreProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <Root />
    </ToastProvider>
  </StrictMode>,
);
