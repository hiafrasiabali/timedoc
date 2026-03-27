import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import { getAdminDashboard } from '../../lib/api';
import { formatMinutes } from '../../components/SessionTable';

export default function AdminDashboard() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
    // Refresh every 60 seconds
    const interval = setInterval(loadDashboard, 60000);
    return () => clearInterval(interval);
  }, []);

  const loadDashboard = async () => {
    try {
      const data = await getAdminDashboard();
      setDashboard(data.dashboard);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const totalToday = dashboard.reduce((sum, e) => sum + e.today_minutes, 0);
  const onlineCount = dashboard.filter((e) => e.is_online).length;

  return (
    <Layout>
      <div className="page-header">
        <h1>Admin Dashboard</h1>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="value">{dashboard.length}</div>
          <div className="label">Total Employees</div>
        </div>
        <div className="stat-card">
          <div className="value" style={{ color: 'var(--success)' }}>{onlineCount}</div>
          <div className="label">Currently Online</div>
        </div>
        <div className="stat-card">
          <div className="value">{formatMinutes(totalToday)}</div>
          <div className="label">Team Hours Today</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Team Overview</h3>
        {loading ? (
          <p style={{ color: 'var(--text-light)' }}>Loading...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Role</th>
                <th>Today</th>
                <th>This Week</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {dashboard.map((emp) => (
                <tr key={emp.id}>
                  <td><strong>{emp.display_name}</strong></td>
                  <td>
                    <span className={`badge ${emp.role === 'admin' ? 'badge-admin' : 'badge-offline'}`}>
                      {emp.role}
                    </span>
                  </td>
                  <td>{formatMinutes(emp.today_minutes)}</td>
                  <td>{formatMinutes(emp.week_minutes)}</td>
                  <td>
                    <span className={`badge ${emp.is_online ? 'badge-online' : 'badge-offline'}`}>
                      {emp.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => router.push(`/admin/employee/${emp.id}`)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
