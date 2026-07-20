// Tiny fetch wrapper for /admin/api/*. Sends session cookie automatically
// (same-origin), attaches CSRF header on mutating requests, and throws on errors.

// Install subfolder, e.g. '/peach' — set by cms/templates/spa.php from the
// server-side auto-detected base path (cms/lib/base_path.php). '' at root.
export const ADMIN_BASE = (typeof window !== 'undefined' && window.__FP_BASE__) || '';

let csrfToken = '';
let onUnauthorized = null;

export function setCsrf(token) {
  csrfToken = token || '';
}

export function getCsrf() {
  return csrfToken;
}

// AuthProvider registers a handler here so any 401 from any endpoint
// (e.g. an expired session caught mid-action) clears React auth state
// and routes back to /login — instead of leaving the user staring at a
// failed mutation toast.
export function setUnauthorizedHandler(fn) {
  onUnauthorized = typeof fn === 'function' ? fn : null;
}

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request(method, path, { body, signal } = {}) {
  const headers = { Accept: 'application/json' };
  const opts = { method, credentials: 'same-origin', headers, signal };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  if (method !== 'GET' && method !== 'HEAD' && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const res = await fetch(`${ADMIN_BASE}/admin/api${path}`, opts);
  const text = await res.text();
  let data = null;
  let parseOk = false;
  try { data = text ? JSON.parse(text) : null; parseOk = true; } catch { /* non-JSON */ }

  if (!res.ok || (data && data.ok === false)) {
    // Skip the global handler for /me itself — the AuthProvider's initial
    // probe is allowed to fail with 401 without bouncing the user.
    if (res.status === 401 && onUnauthorized && path !== '/me') {
      try { onUnauthorized(); } catch { /* ignore */ }
    }
    const msg = (data && data.error) || text || `${res.status} ${res.statusText}`;
    throw new ApiError(msg, res.status, data);
  }
  // A 2xx with a non-empty body that didn't parse means stray PHP output
  // corrupted the response. Treat as a server error rather than returning null,
  // which would cause cryptic null-deref errors in callers.
  if (text && !parseOk) {
    throw new ApiError("Server returned unexpected output — check PHP error logs.", res.status, null);
  }
  return data;
}

export const api = {
  get:    (path, opts) => request('GET', path, opts),
  post:   (path, body, opts) => request('POST', path, { ...opts, body }),
  put:    (path, body, opts) => request('PUT', path, { ...opts, body }),
  delete: (path, opts) => request('DELETE', path, opts),
};
