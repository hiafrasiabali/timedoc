import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import SessionTable from '../../components/SessionTable';
import VideoPlayer from '../../components/VideoPlayer';
import { getMySessions, getSession } from '../../lib/api';

export default function SessionDatePage() {
  const router = useRouter();
  const { date } = router.query;
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [playingChunk, setPlayingChunk] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!date) return;
    loadSessions();
  }, [date]);

  const loadSessions = async () => {
    try {
      const data = await getMySessions(date, date);
      setSessions(data.sessions);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const viewSession = async (sessionId) => {
    try {
      const data = await getSession(sessionId);
      setSelectedSession(data.session);
      setChunks(data.chunks);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Layout>
      <div className="page-header">
        <h1>Sessions - {date}</h1>
        <button className="btn btn-sm" style={{ background: '#f1f5f9' }} onClick={() => router.back()}>
          Back
        </button>
      </div>

      <div className="card">
        {loading ? (
          <p style={{ color: 'var(--text-light)' }}>Loading...</p>
        ) : (
          <SessionTable sessions={sessions} onViewSession={viewSession} />
        )}
      </div>

      {selectedSession && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>
            Session #{selectedSession.id} - Recordings
          </h3>
          {chunks.length === 0 ? (
            <p style={{ color: 'var(--text-light)' }}>No recordings for this session.</p>
          ) : (
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
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => setPlayingChunk(c.id)}
                      >
                        Watch
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {playingChunk && (
        <VideoPlayer chunkId={playingChunk} onClose={() => setPlayingChunk(null)} />
      )}
    </Layout>
  );
}
