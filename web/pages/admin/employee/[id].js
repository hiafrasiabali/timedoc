import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../../components/Layout';
import SessionTable from '../../../components/SessionTable';
import VideoPlayer from '../../../components/VideoPlayer';
import { getEmployeeSessions, getSession } from '../../../lib/api';
import { formatMinutes } from '../../../components/SessionTable';

export default function EmployeeDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [employee, setEmployee] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [dailyData, setDailyData] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [dateSessions, setDateSessions] = useState([]);
  const [chunks, setChunks] = useState([]);
  const [playingChunk, setPlayingChunk] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() - 30);
    setFrom(fromDate.toISOString().slice(0, 10));
    setTo(today.toISOString().slice(0, 10));
  }, [id]);

  useEffect(() => {
    if (from && to && id) loadSessions();
  }, [from, to, id]);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const data = await getEmployeeSessions(id, from, to);
      setEmployee(data.employee);
      setSessions(data.sessions);

      // Group by date
      const byDate = {};
      data.sessions.forEach((s) => {
        if (!byDate[s.work_date]) {
          byDate[s.work_date] = { date: s.work_date, totalMinutes: 0, sessionCount: 0 };
        }
        if (s.status === 'completed') {
          byDate[s.work_date].totalMinutes += s.duration_minutes;
        }
        byDate[s.work_date].sessionCount++;
      });
      setDailyData(Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date)));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const viewDate = (date) => {
    setSelectedDate(date);
    setChunks([]);
    setDateSessions(sessions.filter((s) => s.work_date === date));
  };

  const viewSession = async (sessionId) => {
    try {
      const data = await getSession(sessionId);
      setChunks(data.chunks);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Layout>
      <div className="page-header">
        <h1>{employee ? employee.display_name : 'Employee'}</h1>
        <button className="btn btn-sm" style={{ background: '#f1f5f9' }} onClick={() => router.push('/admin')}>
          Back
        </button>
      </div>

      <div className="date-nav">
        <label>From:</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label>To:</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Daily Summary</h3>
        {loading ? (
          <p style={{ color: 'var(--text-light)' }}>Loading...</p>
        ) : dailyData.length === 0 ? (
          <p style={{ color: 'var(--text-light)' }}>No sessions in this period.</p>
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
                <tr key={d.date} style={selectedDate === d.date ? { background: '#eff6ff' } : {}}>
                  <td>{d.date}</td>
                  <td>{formatMinutes(d.totalMinutes)}</td>
                  <td>{d.sessionCount}</td>
                  <td>
                    <button className="btn btn-primary btn-sm" onClick={() => viewDate(d.date)}>
                      View Sessions
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedDate && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Sessions - {selectedDate}</h3>
          <SessionTable sessions={dateSessions} onViewSession={viewSession} />
        </div>
      )}

      {chunks.length > 0 && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Recordings</h3>
          <table>
            <thead>
              <tr>
                <th>Chunk</th>
                <th>Start</th>
                <th>End</th>
                <th>Size</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {chunks.map((c) => (
                <tr key={c.id}>
                  <td>#{c.chunk_number}</td>
                  <td>{new Date(c.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td>{new Date(c.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td>{c.file_size_mb} MB</td>
                  <td>
                    <button className="btn btn-primary btn-sm" onClick={() => setPlayingChunk(c.id)}>
                      Watch
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {playingChunk && (
        <VideoPlayer chunkId={playingChunk} onClose={() => setPlayingChunk(null)} />
      )}
    </Layout>
  );
}
