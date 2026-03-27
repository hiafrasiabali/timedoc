import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { getReports, downloadCSV } from '../../lib/api';
import { formatMinutes } from '../../components/SessionTable';

export default function Reports() {
  const [report, setReport] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedEmployee, setExpandedEmployee] = useState(null);

  function utcToday() { return new Date().toISOString().slice(0, 10); }
  function utcYesterday() { const d = new Date(); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }
  function weekStartStr() { const t = new Date(); const dow = t.getUTCDay(); t.setUTCDate(t.getUTCDate() - (dow === 0 ? 6 : dow - 1)); return t.toISOString().slice(0, 10); }

  useEffect(() => {
    setFrom(utcToday());
    setTo(utcToday());
  }, []);

  useEffect(() => {
    if (from && to) loadReport();
  }, [from, to]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const data = await getReports(from, to);
      setReport(data.report);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCSV = async () => {
    try {
      const res = await downloadCSV(from, to);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `timedoc-report-${from}-to-${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to download CSV: ' + err.message);
    }
  };

  const totalMinutes = report.reduce((sum, r) => sum + r.total_minutes, 0);

  return (
    <Layout>
      <div className="page-header">
        <h1>Team Reports</h1>
        <button className="btn btn-primary" onClick={handleCSV}>
          Export CSV
        </button>
      </div>

      <div className="date-nav">
        <a href="#" className={from === utcToday() && to === utcToday() ? 'date-link active' : 'date-link'} onClick={(e) => { e.preventDefault(); setFrom(utcToday()); setTo(utcToday()); }}>Today</a>
        <a href="#" className={from === utcYesterday() && to === utcYesterday() ? 'date-link active' : 'date-link'} onClick={(e) => { e.preventDefault(); setFrom(utcYesterday()); setTo(utcYesterday()); }}>Yesterday</a>
        <a href="#" className={from === weekStartStr() && to === utcToday() ? 'date-link active' : 'date-link'} onClick={(e) => { e.preventDefault(); setFrom(weekStartStr()); setTo(utcToday()); }}>This Week</a>
        <span style={{ color: 'var(--border)' }}>|</span>
        <label>From:</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label>To:</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="value">{formatMinutes(totalMinutes)}</div>
          <div className="label">Total Team Hours</div>
        </div>
        <div className="stat-card">
          <div className="value">{report.length}</div>
          <div className="label">Active Employees</div>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <p style={{ color: 'var(--text-light)' }}>Loading...</p>
        ) : report.length === 0 ? (
          <p style={{ color: 'var(--text-light)' }}>No data for this period.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Sessions</th>
                <th>Total Hours</th>
                <th>Break Time</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {report.map((r) => (
                <>
                  <tr key={r.id}>
                    <td><strong>{r.display_name}</strong></td>
                    <td>{r.session_count}</td>
                    <td>{formatMinutes(r.total_minutes)}</td>
                    <td>{formatMinutes(r.total_break_minutes)}</td>
                    <td>
                      {r.daily.length > 0 && (
                        <button
                          className="btn btn-sm"
                          style={{ background: '#f1f5f9' }}
                          onClick={() =>
                            setExpandedEmployee(expandedEmployee === r.id ? null : r.id)
                          }
                        >
                          {expandedEmployee === r.id ? 'Collapse' : 'Daily View'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedEmployee === r.id &&
                    r.daily.map((d) => (
                      <tr key={`${r.id}-${d.work_date}`} style={{ background: '#f8fafc' }}>
                        <td style={{ paddingLeft: 40 }}>{d.work_date}</td>
                        <td>{d.session_count}</td>
                        <td>{formatMinutes(d.total_minutes)}</td>
                        <td>{formatMinutes(d.break_minutes)}</td>
                        <td></td>
                      </tr>
                    ))}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
