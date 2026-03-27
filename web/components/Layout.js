import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { getUser, clearAuth } from '../lib/api';

export default function Layout({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    setUser(u);
  }, []);

  const handleLogout = () => {
    clearAuth();
    router.replace('/login');
  };

  if (!user) return null;

  return (
    <div>
      <nav style={{
        background: '#fff',
        borderBottom: '1px solid var(--border)',
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <strong style={{ fontSize: '1.1rem' }}>TimeDOC</strong>
          {user.role === 'admin' ? (
            <>
              <a href="/admin">Dashboard</a>
              <a href="/admin/manage">Employees</a>
              <a href="/admin/reports">Reports</a>
              <a href="/admin/storage">Storage</a>
            </>
          ) : (
            <a href="/dashboard">My Hours</a>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>
            {user.display_name}
            {user.role === 'admin' && <span className="badge badge-admin" style={{ marginLeft: 8 }}>Admin</span>}
          </span>
          <button onClick={handleLogout} className="btn btn-sm" style={{ background: '#f1f5f9' }}>
            Logout
          </button>
        </div>
      </nav>
      <div className="container">
        {children}
      </div>
    </div>
  );
}
