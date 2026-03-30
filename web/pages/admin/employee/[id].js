import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../../components/Layout';
import VideoPlayer from '../../../components/VideoPlayer';
import { getEmployeeSessions, getSession, getToken } from '../../../lib/api';
import { formatMinutes, todayPKT, yesterdayPKT } from '../../../components/SessionTable';

export default function EmployeeDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [employee, setEmployee] = useState(null);
  const [dailyData, setDailyData] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [allChunks, setAllChunks] = useState([]);
  const [playingChunk, setPlayingChunk] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [chunksLoading, setChunksLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    setFrom(todayPKT());
    setTo(todayPKT());
  }, [id]);

  useEffect(() => {
    if (from && to && id) loadSessions();
  }, [from, to, id]);

  const loadSessions = async () => {
    setLoading(true);
    setAllChunks([]);
    setSelectedDate(null);
    try {
      const data = await getEmployeeSessions(id, from, to);
      setEmployee(data.employee);

      const byDate = {};
      data.sessions.forEach((s) => {
        if (!byDate[s.work_date]) {
          byDate[s.work_date] = { date: s.work_date, totalMinutes: 0, sessionCount: 0, sessions: [] };
        }
        byDate[s.work_date].totalMinutes += s.duration_minutes || 0;
        byDate[s.work_date].sessionCount++;
        byDate[s.work_date].sessions.push(s);
      });
      const sorted = Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));
      setDailyData(sorted);

      // Auto-load activity for first date
      if (sorted.length > 0) {
        loadChunksForDate(sorted[0].date, sorted[0].sessions);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadChunksForDate = async (date, sessions) => {
    setSelectedDate(date);
    setChunksLoading(true);
    setAllChunks([]);
    try {
      const chunks = [];
      for (const s of sessions) {
        const detail = await getSession(s.id);
        if (detail.chunks) {
          detail.chunks.forEach((c) => chunks.push({ ...c, sessionId: s.id }));
        }
      }
      chunks.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
      setAllChunks(chunks);
    } catch (err) {
      console.error(err);
    } finally {
      setChunksLoading(false);
    }
  };

  const viewDate = (date) => {
    const dayData = dailyData.find((d) => d.date === date);
    if (!dayData) return;
    loadChunksForDate(date, dayData.sessions);
  };

  // Group chunks by date + hour in PKT
  const TZ = 'Asia/Karachi';
  const groupedByHour = {};
  allChunks.forEach((c) => {
    const d = new Date(c.start_time.includes('T') ? c.start_time : c.start_time.replace(' ', 'T') + 'Z');
    const datePkt = d.toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
    const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: true, timeZone: TZ }).formatToParts(d);
    const hourVal = parts.find(p => p.type === 'hour').value;
    const ampm = parts.find(p => p.type === 'dayPeriod').value;
    const key = datePkt + '|' + hourVal + ' ' + ampm;
    if (!groupedByHour[key]) groupedByHour[key] = { date: datePkt, hour: hourVal + ' ' + ampm, chunks: [] };
    groupedByHour[key].chunks.push(c);
  });

  const hourGroups = Object.values(groupedByHour);
  const token = typeof window !== 'undefined' ? getToken() : '';

  return (
    <Layout>
      <div className="page-header">
        <h1>{employee ? employee.display_name : 'Employee'}</h1>
        <button className="btn btn-sm" style={{ background: '#f1f5f9' }} onClick={() => router.push('/admin')}>
          Back
        </button>
      </div>

      <div className="date-nav">
        <a href="#" className={from === todayPKT() && to === todayPKT() ? 'date-link active' : 'date-link'} onClick={(e) => { e.preventDefault(); setFrom(todayPKT()); setTo(todayPKT()); }}>Today</a>
        <a href="#" className={from === yesterdayPKT() && to === yesterdayPKT() ? 'date-link active' : 'date-link'} onClick={(e) => { e.preventDefault(); setFrom(yesterdayPKT()); setTo(yesterdayPKT()); }}>Yesterday</a>
        <span style={{ color: 'var(--border)' }}>|</span>
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
                      View Activity
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedDate && (() => {
        const dayInfo = dailyData.find(d => d.date === selectedDate);
        const TZ_S = 'Asia/Karachi';
        const fmt = { hour: 'numeric', minute: '2-digit', timeZone: TZ_S };
        return (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 16 }}>Activity - {selectedDate}</h3>

          {dayInfo && dayInfo.sessions.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="stat-grid">
                <div className="stat-card">
                  <div className="value">{formatMinutes(dayInfo.totalMinutes)}</div>
                  <div className="label">Total Worked</div>
                </div>
                <div className="stat-card">
                  <div className="value">{dayInfo.sessionCount}</div>
                  <div className="label">Session{dayInfo.sessionCount !== 1 ? 's' : ''}</div>
                </div>
              </div>
              <table>
                <thead>
                  <tr><th>Session</th><th>Start</th><th>End</th><th>Duration</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {dayInfo.sessions.map((s, i) => {
                    const st = new Date(s.start_time.includes('T') ? s.start_time : s.start_time.replace(' ', 'T') + 'Z');
                    const en = s.end_time ? new Date(s.end_time.includes('T') ? s.end_time : s.end_time.replace(' ', 'T') + 'Z') : null;
                    return (
                      <tr key={s.id}>
                        <td>#{i + 1}</td>
                        <td>{st.toLocaleTimeString('en-PK', fmt)}</td>
                        <td>{en ? en.toLocaleTimeString('en-PK', fmt) : 'Running'}</td>
                        <td>{formatMinutes(s.duration_minutes || 0)}</td>
                        <td><span className={'badge ' + (s.status === 'active' ? 'badge-online' : s.status === 'completed' ? 'badge-offline' : 'badge-admin')}>{s.status}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {chunksLoading ? (
            <p style={{ color: 'var(--text-light)' }}>Loading recordings...</p>
          ) : allChunks.length === 0 ? (
            <div className="card">
              <p style={{ color: 'var(--text-light)' }}>No recordings for this date.</p>
            </div>
          ) : (
            <div className="timeline-container">
              {hourGroups.map((group) => (
                <div key={group.date + group.hour} className="timeline-section">
                  <div className="timeline-hour">
                    <div className="timeline-date">{group.date}</div>
                    <div>{group.hour}</div>
                  </div>
                  <div className="screenshot-grid">
                    {group.chunks.map((c) => {
                      const tStart = new Date(c.start_time.includes('T') ? c.start_time : c.start_time.replace(' ', 'T') + 'Z');
                      const tEnd = new Date(c.end_time.includes('T') ? c.end_time : c.end_time.replace(' ', 'T') + 'Z');
                      const fmt = { hour: 'numeric', minute: '2-digit', timeZone: TZ };
                      const timeStr = tStart.toLocaleTimeString('en-PK', fmt) + ' - ' + tEnd.toLocaleTimeString('en-PK', fmt);
                      return (
                        <div
                          key={c.id}
                          className="screenshot-card"
                          onClick={() => setPlayingChunk(c.id)}
                        >
                          <div className="screenshot-img">
                            <img
                              src={`/api/recordings/${c.id}/thumbnail?token=${encodeURIComponent(token)}`}
                              alt={`Screenshot ${timeStr}`}
                              loading="lazy"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.parentElement.classList.add('no-thumb');
                              }}
                            />
                            <div className="play-overlay">&#9654;</div>
                          </div>
                          <div className="screenshot-time">{timeStr}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        );
      })()}

      {playingChunk && (
        <VideoPlayer chunkId={playingChunk} onClose={() => setPlayingChunk(null)} />
      )}

      <style jsx>{`
        .timeline-container {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .timeline-section {
          display: flex;
          gap: 20px;
        }
        .timeline-hour {
          width: 90px;
          flex-shrink: 0;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-light);
          padding-top: 8px;
          text-align: right;
        }
        .timeline-date {
          font-size: 0.7rem;
          font-weight: 500;
          color: #94a3b8;
          margin-bottom: 2px;
        }
        .screenshot-grid {
          flex: 1;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 12px;
        }
        .screenshot-card {
          cursor: pointer;
          border-radius: var(--radius);
          overflow: hidden;
          border: 1px solid var(--border);
          background: var(--card-bg);
          transition: box-shadow 0.15s, transform 0.15s;
        }
        .screenshot-card:hover {
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          transform: translateY(-2px);
        }
        .screenshot-img {
          position: relative;
          background: #1e293b;
          aspect-ratio: 16/9;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .screenshot-img img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .screenshot-img.no-thumb {
          background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
        }
        .screenshot-img.no-thumb::after {
          content: '🖥';
          font-size: 2rem;
        }
        .play-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.3);
          color: white;
          font-size: 1.5rem;
          opacity: 0;
          transition: opacity 0.15s;
        }
        .screenshot-card:hover .play-overlay {
          opacity: 1;
        }
        .screenshot-time {
          padding: 6px 10px;
          font-size: 0.8rem;
          color: var(--text-light);
          font-weight: 500;
        }
        @media (max-width: 600px) {
          .timeline-section { flex-direction: column; gap: 8px; }
          .timeline-hour { width: auto; text-align: left; }
          .screenshot-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
        }
      `}</style>
    </Layout>
  );
}
