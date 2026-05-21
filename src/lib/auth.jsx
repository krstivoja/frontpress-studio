import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setCsrf, setUnauthorizedHandler } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    status: 'loading',
    user: null,
    passwordIsDefault: false,
    update: null,
  });

  const refresh = useCallback(async () => {
    try {
      const me = await api.get('/me');
      setCsrf(me.csrf);
      setState({
        status: 'ready',
        user: me.user,
        passwordIsDefault: !!me.passwordIsDefault,
        // Authenticated payload includes { current, latest, available, notes };
        // unauthenticated probe omits it (null), and the sidebar banner
        // skips render in that case.
        update: me.update || null,
      });
    } catch {
      setCsrf('');
      setState({ status: 'ready', user: null, passwordIsDefault: false, update: null });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Catch session expiry on any request: clear React auth state so the
  // <Protected> wrapper bounces the user to /login. The api layer skips
  // /me itself, so the initial unauth probe doesn't trip this.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setCsrf('');
      setState({ status: 'ready', user: null, passwordIsDefault: false, update: null });
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (username, password) => {
    const res = await api.post('/login', { username, password });
    setCsrf(res.csrf);
    // After login, re-read /me to pick up passwordIsDefault from the server
    // (the login response doesn't carry it, and we want the banner to render
    // immediately rather than after the next reload).
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try { await api.post('/logout'); } catch { /* ignore */ }
    setCsrf('');
    setState({ status: 'ready', user: null, passwordIsDefault: false, update: null });
    await refresh();
  }, [refresh]);

  return (
    <AuthCtx.Provider value={{ ...state, login, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
