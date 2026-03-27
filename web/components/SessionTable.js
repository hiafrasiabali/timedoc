export function formatMinutes(mins) {
  if (!mins) return '0h 0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

const TZ = 'Asia/Karachi';

export function formatTime(datetime) {
  if (!datetime) return '-';
  const d = new Date(datetime.includes('T') ? datetime : datetime.replace(' ', 'T') + 'Z');
  return d.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
}

export function formatDatePKT(datetime) {
  if (!datetime) return '-';
  const d = new Date(datetime.includes('T') ? datetime : datetime.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
}

export function todayPKT() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

export function yesterdayPKT() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

export default function SessionTable({ sessions, onViewSession }) {
  if (!sessions || sessions.length === 0) {
    return <p style={{ color: 'var(--text-light)', padding: '20px 0' }}>No sessions found.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Start</th>
          <th>End</th>
          <th>Duration</th>
          <th>Break</th>
          <th>Status</th>
          {onViewSession && <th></th>}
        </tr>
      </thead>
      <tbody>
        {sessions.map((s) => (
          <tr key={s.id}>
            <td>{formatTime(s.start_time)}</td>
            <td>{formatTime(s.end_time)}</td>
            <td>{formatMinutes(s.duration_minutes)}</td>
            <td>{formatMinutes(s.break_minutes)}</td>
            <td>
              <span className={`badge ${s.status === 'active' ? 'badge-online' : s.status === 'paused' ? 'badge-admin' : 'badge-offline'}`}>
                {s.status}
              </span>
            </td>
            {onViewSession && (
              <td>
                <button className="btn btn-primary btn-sm" onClick={() => onViewSession(s.id)}>
                  View
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
