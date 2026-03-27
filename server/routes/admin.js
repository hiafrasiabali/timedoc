const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { adminMiddleware } = require('../middleware/admin');

const router = express.Router();

// All admin routes require auth + admin role
router.use(authMiddleware);
router.use(adminMiddleware);

// GET /api/admin/dashboard
router.get('/dashboard', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  // Get start of current week (Monday)
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - mondayOffset);
  const weekStart = monday.toISOString().slice(0, 10);

  const employees = db.prepare(
    "SELECT id, username, display_name, role, is_active FROM users WHERE is_active = 1"
  ).all();

  const dashboard = employees.map((emp) => {
    // Today's hours (include active sessions too)
    const todaySessions = db.prepare(
      "SELECT SUM(duration_minutes) as total FROM sessions WHERE user_id = ? AND work_date = ?"
    ).get(emp.id, today);

    // Week's hours
    const weekSessions = db.prepare(
      "SELECT SUM(duration_minutes) as total FROM sessions WHERE user_id = ? AND work_date BETWEEN ? AND ?"
    ).get(emp.id, weekStart, today);

    // Is currently online (has active session)
    const activeSession = db.prepare(
      "SELECT id FROM sessions WHERE user_id = ? AND status IN ('active', 'paused')"
    ).get(emp.id);

    return {
      ...emp,
      today_minutes: todaySessions.total || 0,
      week_minutes: weekSessions.total || 0,
      is_online: !!activeSession,
      status: activeSession ? 'Online' : 'Offline',
    };
  });

  res.json({ dashboard });
});

// GET /api/admin/employees
router.get('/employees', (req, res) => {
  const employees = db.prepare(
    'SELECT id, username, display_name, role, is_active, created_at FROM users ORDER BY created_at DESC'
  ).all();

  res.json({ employees });
});

// POST /api/admin/employees
router.post('/employees', (req, res) => {
  const { username, password, display_name, role } = req.body;

  if (!username || !password || !display_name) {
    return res.status(400).json({ error: 'username, password, and display_name required' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)'
  ).run(username, hash, display_name, role || 'employee');

  const user = db.prepare(
    'SELECT id, username, display_name, role, is_active, created_at FROM users WHERE id = ?'
  ).get(result.lastInsertRowid);

  res.status(201).json({ employee: user });
});

// PUT /api/admin/employees/:id
router.put('/employees/:id', (req, res) => {
  const { display_name, password, is_active, role } = req.body;
  const userId = req.params.id;

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  if (display_name !== undefined) {
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(display_name, userId);
  }
  if (password !== undefined) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
  }
  if (is_active !== undefined) {
    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, userId);
  }
  if (role !== undefined) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
  }

  const updated = db.prepare(
    'SELECT id, username, display_name, role, is_active, created_at FROM users WHERE id = ?'
  ).get(userId);

  res.json({ employee: updated });
});

// DELETE /api/admin/employees/:id
router.delete('/employees/:id', (req, res) => {
  const userId = req.params.id;

  // Prevent deleting yourself
  if (Number(userId) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  // Soft delete - deactivate instead of removing data
  db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(userId);

  res.json({ message: 'Employee deactivated' });
});

// GET /api/admin/employees/:id/sessions?from=&to=
router.get('/employees/:id/sessions', (req, res) => {
  const { from, to } = req.query;
  const userId = req.params.id;

  if (!from || !to) {
    return res.status(400).json({ error: 'from and to query params required' });
  }

  const employee = db.prepare(
    'SELECT id, username, display_name FROM users WHERE id = ?'
  ).get(userId);

  if (!employee) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const sessions = db.prepare(
    'SELECT * FROM sessions WHERE user_id = ? AND work_date BETWEEN ? AND ? ORDER BY start_time DESC'
  ).all(userId, from, to);

  res.json({ employee, sessions });
});

// GET /api/admin/reports?from=&to=
router.get('/reports', (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: 'from and to query params required' });
  }

  const employees = db.prepare(
    'SELECT id, username, display_name FROM users WHERE is_active = 1'
  ).all();

  const report = employees.map((emp) => {
    const stats = db.prepare(
      `SELECT
        COUNT(*) as session_count,
        COALESCE(SUM(duration_minutes), 0) as total_minutes,
        COALESCE(SUM(break_minutes), 0) as total_break_minutes
      FROM sessions
      WHERE user_id = ? AND work_date BETWEEN ? AND ? AND status = 'completed'`
    ).get(emp.id, from, to);

    // Daily breakdown
    const daily = db.prepare(
      `SELECT
        work_date,
        COUNT(*) as session_count,
        COALESCE(SUM(duration_minutes), 0) as total_minutes,
        COALESCE(SUM(break_minutes), 0) as break_minutes
      FROM sessions
      WHERE user_id = ? AND work_date BETWEEN ? AND ? AND status = 'completed'
      GROUP BY work_date
      ORDER BY work_date DESC`
    ).all(emp.id, from, to);

    return {
      ...emp,
      ...stats,
      daily,
    };
  });

  res.json({ report, from, to });
});

// GET /api/admin/reports/csv?from=&to=
router.get('/reports/csv', (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: 'from and to query params required' });
  }

  const rows = db.prepare(
    `SELECT
      u.display_name,
      u.username,
      s.work_date,
      s.start_time,
      s.end_time,
      s.duration_minutes,
      s.break_minutes
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.work_date BETWEEN ? AND ? AND s.status = 'completed'
    ORDER BY u.display_name, s.work_date, s.start_time`
  ).all(from, to);

  let csv = 'Employee,Username,Work Date,Start Time,End Time,Duration (min),Break (min)\n';
  for (const row of rows) {
    csv += `"${row.display_name}","${row.username}","${row.work_date}","${row.start_time}","${row.end_time}",${row.duration_minutes},${row.break_minutes}\n`;
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=timedoc-report-${from}-to-${to}.csv`);
  res.send(csv);
});

// GET /api/admin/storage - disk usage stats
router.get('/storage', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const { execSync } = require('child_process');
  const UPLOADS = path.join(__dirname, '..', 'uploads');

  // Total disk
  let diskTotal = 0, diskUsed = 0, diskFree = 0;
  try {
    const df = execSync("df -B1 / | tail -1").toString().trim().split(/\s+/);
    diskTotal = parseInt(df[1]);
    diskUsed = parseInt(df[2]);
    diskFree = parseInt(df[3]);
  } catch {}

  // Recordings size per month
  const months = {};
  let totalRecSize = 0;
  const chunks = db.prepare(
    'SELECT r.file_path, r.file_size_mb, r.start_time, s.user_id, u.display_name FROM recording_chunks r JOIN sessions s ON r.session_id = s.id JOIN users u ON s.user_id = u.id ORDER BY r.start_time DESC'
  ).all();

  chunks.forEach((c) => {
    const month = c.start_time.slice(0, 7); // YYYY-MM
    if (!months[month]) months[month] = { month, sizeMb: 0, count: 0 };
    months[month].sizeMb += c.file_size_mb || 0;
    months[month].count++;
    totalRecSize += c.file_size_mb || 0;
  });

  res.json({
    disk: {
      totalGb: Math.round(diskTotal / 1073741824 * 10) / 10,
      usedGb: Math.round(diskUsed / 1073741824 * 10) / 10,
      freeGb: Math.round(diskFree / 1073741824 * 10) / 10,
      usedPercent: Math.round(diskUsed / diskTotal * 100),
    },
    recordings: {
      totalSizeMb: Math.round(totalRecSize * 10) / 10,
      totalChunks: chunks.length,
      byMonth: Object.values(months),
    },
  });
});

// DELETE /api/admin/storage/cleanup?before=YYYY-MM-DD
router.delete('/storage/cleanup', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const { before } = req.query;
  const UPLOADS = path.join(__dirname, '..', 'uploads');

  if (!before) {
    return res.status(400).json({ error: 'before query param required (YYYY-MM-DD)' });
  }

  // Find chunks before the date
  const chunks = db.prepare(
    'SELECT r.* FROM recording_chunks r JOIN sessions s ON r.session_id = s.id WHERE r.start_time < ?'
  ).all(before);

  let deletedFiles = 0;
  let freedMb = 0;

  for (const c of chunks) {
    const fp = path.join(UPLOADS, c.file_path);
    const thumbPath = fp.replace('.webm', '_thumb.jpg');
    try {
      if (fs.existsSync(fp)) { fs.unlinkSync(fp); deletedFiles++; freedMb += c.file_size_mb || 0; }
      if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
    } catch {}
    db.prepare('DELETE FROM recording_chunks WHERE id = ?').run(c.id);
  }

  // Clean empty session directories
  try {
    const dirs = fs.readdirSync(UPLOADS);
    for (const d of dirs) {
      const dp = path.join(UPLOADS, d);
      if (d === 'tmp' || d === '.gitkeep') continue;
      try {
        const files = fs.readdirSync(dp);
        if (files.length === 0) fs.rmdirSync(dp);
      } catch {}
    }
  } catch {}

  res.json({
    deleted: deletedFiles,
    freedMb: Math.round(freedMb * 10) / 10,
    chunksRemoved: chunks.length,
  });
});

module.exports = router;
