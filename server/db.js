const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'timedoc.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'employee' CHECK(role IN ('employee', 'admin')),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    work_date DATE NOT NULL,
    start_time DATETIME NOT NULL DEFAULT (datetime('now')),
    end_time DATETIME,
    duration_minutes INTEGER DEFAULT 0,
    break_minutes INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed')),
    paused_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS recording_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    chunk_number INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    file_size_mb REAL DEFAULT 0,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    uploaded_at DATETIME NOT NULL DEFAULT (datetime('now'))
  );
`);

// Add last_heartbeat column if missing (migration)
try {
  db.exec('ALTER TABLE sessions ADD COLUMN last_heartbeat DATETIME');
} catch {
  // Column already exists
}

// Auto-complete stale sessions
function cleanupStaleSessions() {
  const now = new Date();

  // Use SQLite datetime format (space, no T, no Z) for correct comparison
  function toSqlite(date) {
    return date.toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);
  }

  const fiveMinAgo = toSqlite(new Date(now - 5 * 60 * 1000));
  const tenMinAgo = toSqlite(new Date(now - 10 * 60 * 1000));

  // Sessions with heartbeat that stopped beating
  const staleWithHeartbeat = db.prepare(
    "SELECT * FROM sessions WHERE status IN ('active', 'paused') AND last_heartbeat IS NOT NULL AND last_heartbeat < ?"
  ).all(fiveMinAgo);

  // Sessions with NO heartbeat that started more than 10 min ago (old app versions)
  const staleNoHeartbeat = db.prepare(
    "SELECT * FROM sessions WHERE status IN ('active', 'paused') AND last_heartbeat IS NULL AND start_time < ?"
  ).all(tenMinAgo);

  const allStale = [...staleWithHeartbeat, ...staleNoHeartbeat];

  for (const session of allStale) {
    const startTime = new Date(session.start_time.replace(' ', 'T') + 'Z');
    const endRef = session.last_heartbeat ? new Date(session.last_heartbeat) : now;
    const totalMinutes = Math.max(0, Math.round((endRef - startTime) / 60000) - session.break_minutes);
    const endTime = session.last_heartbeat || now.toISOString();

    db.prepare(
      'UPDATE sessions SET status = ?, end_time = ?, duration_minutes = ? WHERE id = ?'
    ).run('completed', endTime, totalMinutes, session.id);

    console.log(`Auto-completed stale session ${session.id} (user ${session.user_id}, ${totalMinutes}min)`);
  }
}

// Run cleanup every 2 minutes
setInterval(cleanupStaleSessions, 2 * 60 * 1000);
// Also run on startup
cleanupStaleSessions();

// Seed admin account if it doesn't exist
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('Td@2026$xK9m', 10);
  db.prepare(
    'INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)'
  ).run('admin', hash, 'Administrator', 'admin');
  console.log('Admin account created');
}

module.exports = db;
