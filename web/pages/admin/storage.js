import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { getToken } from '../../lib/api';

export default function StoragePage() {
  const [storage, setStorage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [result, setResult] = useState(null);
  const [beforeDate, setBeforeDate] = useState('');

  useEffect(() => {
    loadStorage();
    // Default cleanup date: 3 months ago
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    setBeforeDate(d.toISOString().slice(0, 10));
  }, []);

  const loadStorage = async () => {
    try {
      const token = getToken();
      const res = await fetch('/api/admin/storage', {
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await res.json();
      setStorage(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCleanup = async () => {
    if (!confirm('Delete all recordings before ' + beforeDate + '? This cannot be undone.')) return;
    setCleaning(true);
    setResult(null);
    try {
      const token = getToken();
      const res = await fetch('/api/admin/storage/cleanup?before=' + beforeDate, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await res.json();
      setResult(data);
      loadStorage();
    } catch (err) {
      alert('Cleanup failed: ' + err.message);
    } finally {
      setCleaning(false);
    }
  };

  const formatGb = (gb) => gb >= 1 ? gb.toFixed(1) + ' GB' : (gb * 1024).toFixed(0) + ' MB';

  return (
    <Layout>
      <div className="page-header">
        <h1>Storage Management</h1>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-light)' }}>Loading...</p>
      ) : storage && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="value">{storage.disk.freeGb} GB</div>
              <div className="label">Free Disk Space</div>
            </div>
            <div className="stat-card">
              <div className="value">{storage.disk.usedPercent}%</div>
              <div className="label">Disk Used ({storage.disk.usedGb} / {storage.disk.totalGb} GB)</div>
            </div>
            <div className="stat-card">
              <div className="value">{storage.recordings.totalSizeMb >= 1024 ? (storage.recordings.totalSizeMb / 1024).toFixed(1) + ' GB' : Math.round(storage.recordings.totalSizeMb) + ' MB'}</div>
              <div className="label">Total Recordings ({storage.recordings.totalChunks} chunks)</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <div className="card" style={{ flex: 1, minWidth: 300 }}>
              <h3 style={{ marginBottom: 16 }}>Recordings by Month</h3>
              {storage.recordings.byMonth.length === 0 ? (
                <p style={{ color: 'var(--text-light)' }}>No recordings yet.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Chunks</th>
                      <th>Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storage.recordings.byMonth.map((m) => (
                      <tr key={m.month}>
                        <td>{m.month}</td>
                        <td>{m.count}</td>
                        <td>{m.sizeMb >= 1024 ? (m.sizeMb / 1024).toFixed(1) + ' GB' : Math.round(m.sizeMb) + ' MB'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card" style={{ flex: 1, minWidth: 300 }}>
              <h3 style={{ marginBottom: 16 }}>Cleanup Old Recordings</h3>
              <p style={{ color: 'var(--text-light)', fontSize: '0.875rem', marginBottom: 16 }}>
                Delete all recordings older than the selected date. Session data (hours, dates) will be kept - only video files are removed.
              </p>

              <div className="form-group">
                <label>Delete recordings before</label>
                <input
                  type="date"
                  value={beforeDate}
                  onChange={(e) => setBeforeDate(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {[
                  { label: '1 month ago', months: 1 },
                  { label: '3 months ago', months: 3 },
                  { label: '6 months ago', months: 6 },
                ].map((opt) => {
                  const d = new Date();
                  d.setMonth(d.getMonth() - opt.months);
                  const val = d.toISOString().slice(0, 10);
                  return (
                    <button
                      key={opt.months}
                      className={`btn btn-sm ${beforeDate === val ? 'btn-primary' : ''}`}
                      style={beforeDate !== val ? { background: '#f1f5f9' } : {}}
                      onClick={() => setBeforeDate(val)}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              <button
                className="btn btn-danger"
                style={{ width: '100%', padding: '10px' }}
                onClick={handleCleanup}
                disabled={cleaning}
              >
                {cleaning ? 'Cleaning...' : 'Delete Old Recordings'}
              </button>

              {result && (
                <div style={{
                  marginTop: 12,
                  padding: 12,
                  background: '#f0fdf4',
                  borderRadius: 'var(--radius)',
                  fontSize: '0.875rem',
                  color: '#166534',
                }}>
                  Deleted {result.deleted} files, freed {result.freedMb >= 1024 ? (result.freedMb / 1024).toFixed(1) + ' GB' : result.freedMb + ' MB'}
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <h3 style={{ marginBottom: 8 }}>Storage Estimates</h3>
            <p style={{ color: 'var(--text-light)', fontSize: '0.875rem', lineHeight: 1.8 }}>
              Each employee uses ~120 MB per 4-hour shift.<br />
              4 employees x 26 days = ~12.5 GB per month.<br />
              Current free space ({storage.disk.freeGb} GB) lasts ~{Math.floor(storage.disk.freeGb / 12.5)} months at this rate.<br />
              Run cleanup every few months to keep disk space healthy.
            </p>
          </div>
        </>
      )}
    </Layout>
  );
}
