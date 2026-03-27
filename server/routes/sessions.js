const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// All session routes require auth
router.use(authMiddleware);

// POST /api/sessions/start
router.post('/start', (req, res) => {
  const userId = req.user.id;
  const { work_date } = req.body;

  // Check for already active session
  const active = db.prepare(
    "SELECT id FROM sessions WHERE user_id = ? AND status IN ('active', 'paused')"
  ).get(userId);

  if (active) {
    return res.status(400).json({ error: 'You already have an active session', session_id: active.id });
  }

  // Default work_date to today
  const date = work_date || new Date().toISOString().slice(0, 10);

  const result = db.prepare(
    'INSERT INTO sessions (user_id, work_date) VALUES (?, ?)'
  ).run(userId, date);

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ session });
});

// POST /api/sessions/stop
router.post('/stop', (req, res) => {
  const userId = req.user.id;

  const session = db.prepare(
    "SELECT * FROM sessions WHERE user_id = ? AND status IN ('active', 'paused')"
  ).get(userId);

  if (!session) {
    return res.status(400).json({ error: 'No active session' });
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // Parse start_time - SQLite stores as 'YYYY-MM-DD HH:MM:SS' (UTC)
  const startTime = new Date(session.start_time.replace(' ', 'T') + 'Z');
  const elapsedMs = now - startTime;
  let totalMinutes = Math.max(0, Math.round(elapsedMs / 60000) - session.break_minutes);

  db.prepare(
    'UPDATE sessions SET status = ?, end_time = ?, duration_minutes = ? WHERE id = ?'
  ).run('completed', nowIso, totalMinutes, session.id);

  const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id);
  res.json({ session: updated });
});

// POST /api/sessions/pause
router.post('/pause', (req, res) => {
  const userId = req.user.id;

  const session = db.prepare(
    "SELECT * FROM sessions WHERE user_id = ? AND status = 'active'"
  ).get(userId);

  if (!session) {
    return res.status(400).json({ error: 'No active session to pause' });
  }

  const now = new Date().toISOString();

  db.prepare(
    'UPDATE sessions SET status = ?, paused_at = ? WHERE id = ?'
  ).run('paused', now, session.id);

  const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id);
  res.json({ session: updated });
});

// POST /api/sessions/resume
router.post('/resume', (req, res) => {
  const userId = req.user.id;

  const session = db.prepare(
    "SELECT * FROM sessions WHERE user_id = ? AND status = 'paused'"
  ).get(userId);

  if (!session) {
    return res.status(400).json({ error: 'No paused session to resume' });
  }

  const now = new Date();
  const pausedAt = new Date(session.paused_at);
  const breakMs = now - pausedAt;
  const additionalBreakMinutes = Math.round(breakMs / 60000);

  db.prepare(
    'UPDATE sessions SET status = ?, break_minutes = break_minutes + ?, paused_at = NULL WHERE id = ?'
  ).run('active', additionalBreakMinutes, session.id);

  const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id);
  res.json({ session: updated });
});

// POST /api/sessions/heartbeat - updates duration_minutes in real-time
router.post('/heartbeat', (req, res) => {
  const userId = req.user.id;

  const session = db.prepare(
    "SELECT * FROM sessions WHERE user_id = ? AND status IN ('active', 'paused')"
  ).get(userId);

  if (!session) {
    return res.status(400).json({ error: 'No active session' });
  }

  const now = new Date();
  const startTime = new Date(session.start_time.replace(' ', 'T') + 'Z');
  const elapsedMs = now - startTime;
  const totalMinutes = Math.max(0, Math.round(elapsedMs / 60000) - session.break_minutes);

  db.prepare('UPDATE sessions SET duration_minutes = ? WHERE id = ?').run(totalMinutes, session.id);

  res.json({ duration_minutes: totalMinutes });
});

// GET /api/sessions/active
router.get('/active', (req, res) => {
  const session = db.prepare(
    "SELECT * FROM sessions WHERE user_id = ? AND status IN ('active', 'paused')"
  ).get(req.user.id);

  res.json({ session: session || null });
});

// GET /api/sessions/my?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/my', (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: 'from and to query params required (YYYY-MM-DD)' });
  }

  const sessions = db.prepare(
    'SELECT * FROM sessions WHERE user_id = ? AND work_date BETWEEN ? AND ? ORDER BY start_time DESC'
  ).all(req.user.id, from, to);

  res.json({ sessions });
});

// GET /api/sessions/:id
router.get('/:id', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Employees can only view their own sessions
  if (req.user.role !== 'admin' && session.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const chunks = db.prepare(
    'SELECT * FROM recording_chunks WHERE session_id = ? ORDER BY chunk_number ASC'
  ).all(session.id);

  res.json({ session, chunks });
});

module.exports = router;
