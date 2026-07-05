import { NavLink, Outlet } from 'react-router-dom';

export default function Settings() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <nav className="flex gap-1 border-b border-zinc-200 text-sm">
        <Tab to="/settings" end>Site settings</Tab>
        <Tab to="/settings/themes">Themes</Tab>
        <Tab to="/settings/reference">Theme reference</Tab>
        <Tab to="/settings/skills">Skills</Tab>
        <Tab to="/settings/seo">SEO</Tab>
        <Tab to="/settings/email">Email</Tab>
        <Tab to="/settings/integrations">Integrations</Tab>
        <Tab to="/settings/security">Security</Tab>
      </nav>
      <Outlet />
    </div>
  );
}

function Tab({ to, end, children }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `-mb-px border-b-2 px-3 py-2 transition-colors ${
          isActive
            ? 'border-zinc-900 font-medium text-zinc-900'
            : 'border-transparent text-zinc-500 hover:text-zinc-800'
        }`
      }
    >
      {children}
    </NavLink>
  );
}
