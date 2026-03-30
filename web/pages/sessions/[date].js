import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import VideoPlayer from '../../components/VideoPlayer';
import { getMySessions, getSession, getToken } from '../../lib/api';
import { formatMinutes, formatTime, todayPKT, yesterdayPKT } from '../../components/SessionTable';

export default function SessionDatePage() {
  const router = useRouter();
  const { date } = router.query;
  const [sessions, setSessions] = useState([]);
  const [allChunks, setAllChunks] = useState([]);
  const [playingChunk, setPlayingChunk] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!date) return;
    loadData();
  }, [date]);

  const loadData = async () => {
    try {
      const data = await getMySessions(date, date);
      setSessions(data.sessions);

      // Load chunks for all sessions
      const chunks = [];
      for (const s of data.sessions) {
        const detail = await getSession(s.id);
        if (detail.chunks) {
          detail.chunks.forEach((c) => {
            chunks.push({ ...c, sessionId: s.id, sessionStart: s.start_time });
          });
        }
      }
      // Sort by start_time descending (latest first)
      chunks.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
      setAllChunks(chunks);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Group chunks by date + hour in PKT
  const TZ = 'Asia/Karachi';
  const groupedByHour = {};
  allChunks.forEach((c) => {
    const d = new Date(c.start_time.includes('T') ? c.start_time : c.start_time.replace(' ', 'T') + 'Z');
    const datePkt = d.toLocaleDateString('en-CA', { timeZone: TZ });
    const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: true, timeZone: TZ }).formatToParts(d);
    const hourVal = parts.find(p => p.type === 'hour').value;
    const ampm = parts.find(p => p.type === 'dayPeriod').value;
    const key = datePkt + '|' + hourVal + ' ' + ampm;
    if (!groupedByHour[key]) groupedByHour[key] = { date: datePkt, hour: hourVal + ' ' + ampm, chunks: [] };
    groupedByHour[key].chunks.push(c);
  });

  const hourGroups = Object.values(groupedByHour);

  // Summary
  const totalMinutes = sessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  const token = typeof window !== 'undefined' ? getToken() : '';

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Activity - {date}</h1>
          <p style={{ color: 'var(--text-light)', fontSize: '0.875rem', marginTop: 4 }}>
            {sessions.length} session{sessions.length !== 1 ? 's' : ''} &middot; {formatMinutes(totalMinutes)} worked
          </p>
        </div>
        <button className="btn btn-sm" style={{ background: '#f1f5f9' }} onClick={() => router.back()}>
          Back
        </button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-light)' }}>Loading...</p>
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
                  const time = new Date(c.start_time.includes('T') ? c.start_time : c.start_time.replace(' ', 'T') + 'Z');
                  const timeStr = time.toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
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
