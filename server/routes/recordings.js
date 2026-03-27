const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Configure multer - upload to temp dir first, then move
const upload = multer({
  dest: path.join(UPLOADS_DIR, 'tmp'),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB max per chunk
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'video/webm' || file.originalname.endsWith('.webm')) {
      cb(null, true);
    } else {
      cb(new Error('Only WebM files allowed'));
    }
  },
});

// POST /api/recordings/upload
router.post('/upload', authMiddleware, upload.single('chunk'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { session_id, chunk_number, start_time, end_time } = req.body;

  if (!session_id || !chunk_number) {
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'session_id and chunk_number required' });
  }

  // Verify session belongs to this user
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(
    session_id,
    req.user.id
  );

  if (!session) {
    fs.unlinkSync(req.file.path);
    return res.status(403).json({ error: 'Session not found or access denied' });
  }

  // Move file from tmp to session directory
  const sessionDir = path.join(UPLOADS_DIR, String(session_id));
  fs.mkdirSync(sessionDir, { recursive: true });
  const rawPath = path.join(sessionDir, `chunk_${chunk_number}_raw.webm`);
  const finalPath = path.join(sessionDir, `chunk_${chunk_number}.webm`);
  fs.renameSync(req.file.path, rawPath);

  // Remux with ffmpeg to add duration/seek metadata (makes video seekable)
  try {
    await new Promise((resolve, reject) => {
      execFile('ffmpeg', ['-i', rawPath, '-c', 'copy', '-y', finalPath], { timeout: 30000 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    fs.unlinkSync(rawPath);
  } catch (e) {
    // If ffmpeg fails, use raw file as-is
    if (fs.existsSync(rawPath)) {
      fs.renameSync(rawPath, finalPath);
    }
  }

  const stat = fs.statSync(finalPath);
  const fileSizeMb = stat.size / (1024 * 1024);
  const relativePath = path.relative(UPLOADS_DIR, finalPath);

  const result = db.prepare(
    `INSERT INTO recording_chunks (session_id, chunk_number, file_path, file_size_mb, start_time, end_time)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    session_id,
    chunk_number,
    relativePath,
    Math.round(fileSizeMb * 100) / 100,
    start_time || new Date().toISOString(),
    end_time || new Date().toISOString()
  );

  res.status(201).json({
    chunk: {
      id: result.lastInsertRowid,
      session_id: Number(session_id),
      chunk_number: Number(chunk_number),
      file_size_mb: Math.round(fileSizeMb * 100) / 100,
    },
  });
});

// GET /api/recordings/:id/stream
// Supports token via query param for <video src> usage
router.get('/:id/stream', (req, res, next) => {
  if (!req.headers.authorization && req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
}, authMiddleware, (req, res) => {
  const chunk = db.prepare('SELECT * FROM recording_chunks WHERE id = ?').get(req.params.id);

  if (!chunk) {
    return res.status(404).json({ error: 'Recording chunk not found' });
  }

  // Verify access: admin can view all, employees only their own
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(chunk.session_id);
  if (req.user.role !== 'admin' && session.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const filePath = path.join(UPLOADS_DIR, chunk.file_path);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Recording file not found on disk' });
  }

  const stat = fs.statSync(filePath);
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/webm',
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': 'video/webm',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

module.exports = router;
