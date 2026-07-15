import { NavLink, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useFolders } from '../lib/hooks.js';
import { cap } from '../lib/utils.js';
import SidebarLink from './SidebarLink.jsx';
import SidebarUpdateBanner from './SidebarUpdateBanner.jsx';
import { IconBackup, IconBrush, IconCog, IconFolder, IconGrid, IconImage } from './icons.jsx';
import ResizableAside from './ResizableAside.jsx';

// Sidebar — logo, divider-separated sections (folders / media / settings /
// backup), and a simple "Hi {user} — Log out" footer. No group labels.
export default function Sidebar() {
  const { user, logout } = useAuth();
  const { folders } = useFolders();

  return (
    <ResizableAside
      storageKey="fp_nav_w"
      side="right"
      defaultWidth={240}
      min={180}
      max={420}
      collapseBelow={150}
      collapsedWidth={60}
      className="flex flex-col border-r border-zinc-200 bg-white"
    >
      {({ collapsed }) => (
        <>
          <div className={`flex items-center py-4 ${collapsed ? 'justify-center px-0' : 'gap-2 px-4'}`}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-900 text-[12px] font-bold text-white">
              F
            </span>
            {!collapsed && (
              <span className="text-[15px] font-semibold tracking-tight">FrontPress Admin</span>
            )}
          </div>
          <Divider />

          <nav className={`flex-1 overflow-y-auto py-3 ${collapsed ? 'px-2' : 'px-3'}`}>
            <Section>
              {folders.map(f => <FolderLink key={f} folder={f} collapsed={collapsed} />)}
            </Section>

            <Divider />

            <Section>
              <SidebarLink to="/media" icon={IconImage} collapsed={collapsed}>Global media</SidebarLink>
              <SidebarLink to="/theme-builder" icon={IconBrush} collapsed={collapsed}>Theme builder</SidebarLink>
              <SidebarLink to="/fields" icon={IconGrid} collapsed={collapsed}>Fields</SidebarLink>
            </Section>

            <Divider />

            <Section>
              <SidebarLink to="/settings" icon={IconCog} collapsed={collapsed}>Settings</SidebarLink>
            </Section>

            <Divider />

            <Section>
              <SidebarLink to="/backup" icon={IconBackup} collapsed={collapsed}>Backup</SidebarLink>
            </Section>
          </nav>

          {/* Renders nothing when no update is available — keeps the footer
              flush with the nav on the happy path. */}
          {!collapsed && <SidebarUpdateBanner />}

          <Divider />
          {collapsed ? (
            <div className="flex justify-center py-3">
              <button
                onClick={logout}
                title="Log out"
                aria-label="Log out"
                className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 2H3.5A1.5 1.5 0 0 0 2 3.5v9A1.5 1.5 0 0 0 3.5 14H6M10.5 11l3-3-3-3M13 8H6" />
                </svg>
              </button>
            </div>
          ) : (
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
          )}
        </>
      )}
    </ResizableAside>
  );
}

function Section({ children }) {
  return <div className="space-y-1 py-1">{children}</div>;
}

function Divider() {
  return <div className="border-t border-zinc-100" />;
}

function FolderLink({ folder, collapsed }) {
  const params = useParams();
  const active = params.folder === folder;
  return (
    <NavLink
      to={`/${encodeURIComponent(folder)}`}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? cap(folder) : undefined}
      className={`flex items-center rounded-md py-2 text-[13px] font-medium transition-colors ${
        collapsed ? 'justify-center px-0' : 'gap-2 px-3'
      } ${
        active
          ? 'bg-zinc-900 text-white'
          : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900'
      }`}
    >
      <span className="text-current opacity-80">{IconFolder}</span>
      {!collapsed && cap(folder)}
    </NavLink>
  );
}
