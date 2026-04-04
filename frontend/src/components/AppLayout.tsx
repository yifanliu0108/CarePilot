import { NavLink, Outlet } from 'react-router-dom'
import { Logo } from './Logo'

type Tab = { to: string; label: string; end?: boolean }

const tabs: Tab[] = [
  { to: '/', label: 'Home', end: true },
  { to: '/summary', label: 'Summary' },
  { to: '/plan', label: 'Plan' },
  { to: '/journey', label: 'LiveActions' },
  { to: '/explanation', label: 'Explanation' },
]

export default function AppLayout() {
  return (
    <div className="cp-shell">
      <aside className="cp-sidebar" aria-label="Main navigation">
        <div className="cp-sidebar__brand">
          <Logo />
        </div>
        <nav className="cp-nav">
          {tabs.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={!!end}
              className={({ isActive }) =>
                'cp-nav__link' + (isActive ? ' cp-nav__link--active' : '')
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="cp-main">
        <Outlet />
      </div>
    </div>
  )
}
