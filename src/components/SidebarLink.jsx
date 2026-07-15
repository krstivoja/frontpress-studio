import { NavLink } from 'react-router-dom';

// Mirrors dsystem `.sidebar-link` — 13px/500, padding 8px 12px, radius-md, 16px icons.
// Inactive links sit at zinc-700 (matches FolderLink): all nav items are
// visual peers, so the active state — not a one-shade colour drift — carries
// the hierarchy. See dsystem/README "Visual hierarchy".
export default function SidebarLink({ to, children, icon, end, collapsed }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed && typeof children === 'string' ? children : undefined}
      className={({ isActive }) =>
        `flex items-center rounded-md py-2 text-[13px] font-medium transition-colors ${
          collapsed ? 'justify-center px-0' : 'gap-2 px-3'
        } ${
          isActive
            ? 'bg-zinc-900 text-white'
            : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900'
        }`
      }
    >
      {({ isActive }) => (
        // `aria-current="page"` — exposed via the inner span so AT users
        // hear the current item without the visual styling carrying the
        // semantics on its own.
        <span className="contents" aria-current={isActive ? 'page' : undefined}>
          {icon && <span className="text-current opacity-80">{icon}</span>}
          {!collapsed && children}
        </span>
      )}
    </NavLink>
  );
}
