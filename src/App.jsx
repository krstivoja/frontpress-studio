import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';

import Protected from './components/Protected.jsx';
import Shell, { PaddedOutlet } from './components/Shell.jsx';
import PostTypeShell from './components/PostTypeShell.jsx';
import NotFound from './components/NotFound.jsx';

import Login from './screens/Login.jsx';
import PagesList from './screens/PagesList.jsx';

const PageEditor   = lazy(() => import('./screens/PageEditor.jsx'));
const Media        = lazy(() => import('./screens/Media.jsx'));
const Backup       = lazy(() => import('./screens/Backup.jsx'));
const Settings     = lazy(() => import('./screens/Settings/index.jsx'));
const SiteSettings = lazy(() => import('./screens/Settings/SiteSettings.jsx'));
const Fields       = lazy(() => import('./screens/Settings/Fields/index.jsx'));
const Themes       = lazy(() => import('./screens/Settings/Themes.jsx'));
const ThemeBuilder = lazy(() => import('./screens/ThemeBuilder.jsx'));
const Security     = lazy(() => import('./screens/Settings/Security.jsx'));
const ThemeReference = lazy(() => import('./screens/Settings/ThemeReference.jsx'));
const Skills         = lazy(() => import('./screens/Settings/Skills.jsx'));
const SeoSettings    = lazy(() => import('./screens/Settings/SeoSettings.jsx'));
const EmailSettings  = lazy(() => import('./screens/Settings/Email.jsx'));
const Integrations   = lazy(() => import('./screens/Settings/Integrations.jsx'));

export default function App() {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
        Loading…
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected user={user} />}>
        <Route element={<Shell />}>
          <Route element={<PaddedOutlet />}>
            <Route path="/"          element={<PagesList />} />
            <Route path="/media"     element={<Lazy><Media /></Lazy>} />
            <Route path="/fields"    element={<Lazy><Fields /></Lazy>} />
            {/* Fields moved out of Settings (0.4.x). Redirect old bookmarks /
                docs links so they don't hit NotFound. */}
            <Route path="/settings/fields" element={<Navigate to="/fields" replace />} />
            <Route path="/backup"    element={<Lazy><Backup /></Lazy>} />
            <Route path="/settings"  element={<Lazy><Settings /></Lazy>}>
              <Route index           element={<Lazy><SiteSettings /></Lazy>} />
              <Route path="themes"    element={<Lazy><Themes /></Lazy>} />
              <Route path="reference" element={<Lazy><ThemeReference /></Lazy>} />
              <Route path="skills"    element={<Lazy><Skills /></Lazy>} />
              <Route path="seo"          element={<Lazy><SeoSettings /></Lazy>} />
              <Route path="email"        element={<Lazy><EmailSettings /></Lazy>} />
              <Route path="integrations" element={<Lazy><Integrations /></Lazy>} />
              <Route path="security"     element={<Lazy><Security /></Lazy>} />
            </Route>
            <Route path="/:folder" element={<PagesList />} />
            <Route path="*" element={<NotFound />} />
          </Route>

          <Route path="/new/:folder" element={<PostTypeShell />}>
            <Route index element={<Lazy><KeyedPageEditor /></Lazy>} />
          </Route>
          <Route path="/:folder/:slug" element={<PostTypeShell />}>
            <Route index element={<Lazy><KeyedPageEditor /></Lazy>} />
          </Route>
          <Route path="/theme-builder" element={<Lazy><ThemeBuilder /></Lazy>} />
        </Route>
      </Route>
    </Routes>
  );
}

function Lazy({ children }) {
  return <Suspense fallback={<RouteSkeleton />}>{children}</Suspense>;
}

// Force a fresh PageEditor instance per post. React Router reuses the
// same component instance when only URL params change, so switching
// posts (e.g. clicking another item in the sidebar) didn't re-init the
// Toast UI editor — its content stayed pinned to the first post you
// opened. Keying on folder + slug remounts the editor on each post.
// `new` pages get a per-folder key so /new/blog → /new/pages also
// remounts. Saves that don't change the slug are unaffected (no path
// change, no key change, no remount — cursor preserved).
function KeyedPageEditor() {
  const { folder = '', slug } = useParams();
  const key = slug ? `edit:${folder}/${slug}` : `new:${folder}`;
  return <PageEditor key={key} />;
}

function RouteSkeleton() {
  return (
    <div className="space-y-4 p-6" aria-hidden="true" data-testid="route-skeleton">
      <div className="h-8 w-48 animate-pulse rounded-md bg-zinc-200" />
      <div className="h-64 w-full animate-pulse rounded-lg bg-zinc-100" />
    </div>
  );
}
