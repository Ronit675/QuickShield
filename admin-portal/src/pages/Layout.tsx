import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';
import type { LayoutFilters } from '../types/admin';
import './Layout.css';

export default function Layout() {
  const { user, logout } = useAdminAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [filters, setFilters] = useState<LayoutFilters>({
    dateRange: 'week',
    zone: 'all',
    disruptionType: 'all',
    searchQuery: '',
  });

  const navItems = [
    { path: '/dashboard', label: 'Overview', icon: '📊' },
    { path: '/claims', label: 'Claims', icon: '📋' },
    { path: '/fraud-alerts', label: 'Fraud Alerts', icon: '⚠️' },
    { path: '/payouts', label: 'Payouts', icon: '💰' },
    { path: '/zones', label: 'Zones', icon: '🗺️' },
    { path: '/pricing-risk', label: 'Pricing Risk', icon: '📈' },
    { path: '/settings', label: 'Settings', icon: '⚙️' },
  ];

  return (
    <div className="admin-layout">
      <aside className={`sidebar ${sidebarOpen ? 'expanded' : 'collapsed'}`}>
        <div className="sidebar-top">
          <div className="brand-lockup">
            <div className="brand-mark">QS</div>
            {sidebarOpen ? (
              <div>
                <strong>QuickShield</strong>
                <span>Admin Portal</span>
              </div>
            ) : null}
          </div>

          <button className="ghost-btn" onClick={() => setSidebarOpen((current) => !current)}>
            {sidebarOpen ? '‹' : '›'}
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink key={item.path} to={item.path} className="nav-item">
              <span>{item.icon}</span>
              {sidebarOpen ? <span>{item.label}</span> : null}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="admin-summary">
            <div className="avatar-badge">{user?.displayName?.[0] ?? 'A'}</div>
            {sidebarOpen ? (
              <div>
                <strong>{user?.displayName ?? 'Admin'}</strong>
                <span>{user?.role ?? 'ADMIN'}</span>
              </div>
            ) : null}
          </div>
          <button
            className="secondary-btn sidebar-logout"
            onClick={() => {
              logout();
              window.location.assign('/login');
            }}
          >
            {sidebarOpen ? 'Logout' : '←'}
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="control-header">
          <div>
            <p className="eyebrow">Control Center</p>
            <h1>Admin Operations</h1>
          </div>

          <div className="control-filters">
            <select
              value={filters.dateRange}
              onChange={(event) =>
                setFilters((current) => ({ ...current, dateRange: event.target.value as LayoutFilters['dateRange'] }))
              }
            >
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
              <option value="custom">Custom</option>
            </select>
            <select
              value={filters.zone}
              onChange={(event) => setFilters((current) => ({ ...current, zone: event.target.value }))}
            >
              <option value="all">All zones</option>
              <option value="bengaluru-whitefield">Whitefield</option>
              <option value="bengaluru-koramangala">Koramangala</option>
              <option value="bengaluru-btm">BTM</option>
            </select>
            <input
              value={filters.searchQuery}
              placeholder="Search claims, zones, users..."
              onChange={(event) => setFilters((current) => ({ ...current, searchQuery: event.target.value }))}
            />
          </div>
        </header>

        <section className="page-shell">
          <Outlet context={{ filters }} />
        </section>
      </main>
    </div>
  );
}
