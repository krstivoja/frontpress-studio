import { useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import Sidebar from './Sidebar.jsx';
import Button from './ui/Button.jsx';

const DISMISS_KEY = 'fp:default-password-banner-dismissed';

// Outer chrome: optional top banner + the (Sidebar | content) row.
// `<PostTypeShell />` renders as a fragment (PostTypeList + Outlet) — those
// must remain direct children of the same flex *row* alongside <Sidebar />,
// so the banner is lifted into a sibling column above the row rather than
// wrapping the outlet. Padded "regular" screens get their wrapping from
// `<PaddedOutlet>`; the editor renders its own full-bleed layout.
export default function Shell() {
  const { passwordIsDefault } = useAuth();
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-50 text-zinc-900 antialiased">
      {passwordIsDefault && <DefaultPasswordBanner />}
      {/* The row must keep its definite height so the page-editor surface
          can use `flex-1 min-h-0` to fill the viewport; `min-h-0` here lets
          the row shrink to whatever the banner left behind. */}
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <Outlet />
      </div>
    </div>
  );
}

export function PaddedOutlet() {
  return (
    <main className="min-w-0 flex-1 overflow-y-auto p-8">
      <div className="mx-auto max-w-5xl">
        <Outlet />
      </div>
    </main>
  );
}

// Banner — disappears the instant the password is rotated (auth refreshes
// after the change-password mutation). Can also be dismissed manually; the
// dismissal is remembered in localStorage so it stays hidden across reloads.
// Tone is checklist-item, not alarm: "finish setup" rather than "insecure".
function DefaultPasswordBanner() {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === '1',
  );

  if (dismissed) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-4 border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-sm text-amber-900"
    >
      <div className="flex items-center gap-3">
        <span>
          Set a strong admin password to finish setup.
        </span>
        <Link
          to="/settings/security"
          className="font-medium underline decoration-amber-400 underline-offset-2 hover:decoration-amber-700"
        >
          Open Security settings
        </Link>
      </div>
      <Button variant="secondary" size="sm" onClick={dismiss}>
        Dismiss
      </Button>
    </div>
  );
}
