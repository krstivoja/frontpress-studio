import { NavLink, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useFolders } from '../lib/hooks.js';
import { cap } from '../lib/utils.js';
import SidebarLink from './SidebarLink.jsx';
import SidebarUpdateBanner from './SidebarUpdateBanner.jsx';
import { IconBackup, IconBrush, IconCog, IconFolder, IconImage } from './icons.jsx';

// Sidebar — logo, divider-separated sections (folders / media / settings /
// backup), and a simple "Hi {user} — Log out" footer. No group labels.
export default function Sidebar() {
  const { user, logout } = useAuth();
  const { folders } = useFolders();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-200 bg-white">
      <div className="flex items-center gap-2 px-4 py-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900 text-[12px] font-bold text-white">
          M
        </span>
        <span className="text-[15px] font-semibold tracking-tight">FrontPress Admin</span>
      </div>
      <Divider />

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <Section>
          {folders.map(f => <FolderLink key={f} folder={f} />)}
        </Section>

        <Divider />

        <Section>
          <SidebarLink to="/media" icon={IconImage}>Global media</SidebarLink>
          <SidebarLink to="/theme-builder" icon={IconBrush}>Theme builder</SidebarLink>
        </Section>

        <Divider />

        <Section>
          <SidebarLink to="/settings" icon={IconCog}>Settings</SidebarLink>
        </Section>

        <Divider />

        <Section>
          <SidebarLink to="/backup" icon={IconBackup}>Backup</SidebarLink>
        </Section>
      </nav>

      {/* Renders nothing when no update is available — keeps the footer
          flush with the nav on the happy path. */}
      <SidebarUpdateBanner />

      <Divider />
      <div className="flex items-center justify-between gap-2 px-4 py-3 text-[13px]">
        <span className="truncate text-zinc-700">
          Hi <span className="font-semibold text-zinc-900">{user}</span>
        </span>
        <button
          onClick={logout}
          className="font-medium text-zinc-500 transition-colors hover:text-zinc-900 hover:underline"
        >
          Log out
        </button>
      </div>
    </aside>
  );
}

function Section({ children }) {
  return <div className="space-y-1 py-1">{children}</div>;
}

function Divider() {
  return <div className="border-t border-zinc-100" />;
}

function FolderLink({ folder }) {
  const params = useParams();
  const active = params.folder === folder;
  return (
    <NavLink
      to={`/${encodeURIComponent(folder)}`}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
        active
          ? 'bg-zinc-900 text-white'
          : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900'
      }`}
    >
      <span className="text-current opacity-80">{IconFolder}</span>
      {cap(folder)}
    </NavLink>
  );
}
