import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { getMySessions } from '../lib/api';
import { formatMinutes } from '../components/SessionTable';

export default function Dashboard() {
  const router = useRouter();
  const [dailyData, setDailyData] = useState([]);
  const [todayMinutes, setTodayMinutes] = useState(0);
  const [weekMinutes, setWeekMinutes] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Get last 30 days of sessions
      const today = new Date();
      const from = new Date(today);
      from.setDate(from.getDate() - 30);

      const fromStr = from.toISOString().slice(0, 10);
      const toStr = today.toISOString().slice(0, 10);

      const data = await getMySessions(fromStr, toStr);
      const sessions = data.sessions;

      // Group by work_date
      const byDate = {};
      sessions.forEach((s) => {
        if (!byDate[s.work_date]) {
          byDate[s.work_date] = { date: s.work_date, totalMinutes: 0, sessionCount: 0 };
        }
        if (s.status === 'completed') {
          byDate[s.work_date].totalMinutes += s.duration_minutes;
        }
        byDate[s.work_date].sessionCount++;
      });

      const sorted = Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));
      setDailyData(sorted);

      // Today's total
      const todayStr = today.toISOString().slice(0, 10);
      const todayData = byDate[todayStr];
      setTodayMinutes(todayData ? todayData.totalMinutes : 0);

      // This week total (Monday to today)
      const dayOfWeek = today.getDay();
      const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(today);
      monday.setDate(today.getDate() - mondayOffset);
      const mondayStr = monday.toISOString().slice(0, 10);

      let weekTotal = 0;
      Object.values(byDate).forEach((d) => {
        if (d.date >= mondayStr && d.date <= todayStr) {
          weekTotal += d.totalMinutes;
        }
      });
      setWeekMinutes(weekTotal);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="page-header">
        <h1>My Hours</h1>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="value">{formatMinutes(todayMinutes)}</div>
          <div className="label">Today</div>
        </div>
        <div className="stat-card">
          <div className="value">{formatMinutes(weekMinutes)}</div>
          <div className="label">This Week</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Daily Summary</h3>
        {loading ? (
          <p style={{ color: 'var(--text-light)' }}>Loading...</p>
        ) : dailyData.length === 0 ? (
          <p style={{ color: 'var(--text-light)' }}>No sessions in the last 30 days.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Total Hours</th>
                <th>Sessions</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {dailyData.map((d) => (
                <tr key={d.date}>
                  <td>{d.date}</td>
                  <td>{formatMinutes(d.totalMinutes)}</td>
                  <td>{d.sessionCount}</td>
                  <td>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => router.push(`/sessions/${d.date}`)}
                    >
                      View Sessions
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
