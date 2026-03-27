# TimeDOC - Complete Technical Documentation

## Overview

TimeDOC is an employee time tracking application with screen recording, built for remote link building teams. Employees run a lightweight Windows desktop app that records their screen while they work. Admins monitor hours and watch recordings through a web dashboard.

**Built:** March 2026
**Codebase:** 34 source files, ~4,300 lines of code
**Monthly Cost:** ~$4-5 (Contabo VPS only)

---

## Architecture

```
[Employee PC]                    [Contabo VPS - 109.205.181.13]

TimeDOC Desktop App              Nginx (port 80)
  - Login                          |
  - Timer                          +-- /api/* --> Node.js API (port 3001)
  - Screen Recording               +-- /*     --> Next.js Web (port 3000)
  - 5-min chunk upload
                                 SQLite Database (timedoc.db)
                                 Recordings on Disk (/uploads/)
```

### Three Components

1. **Backend API** (Node.js + Express + SQLite) - port 3001
2. **Web Dashboard** (Next.js) - port 3000
3. **Desktop App** (Electron) - Windows .exe

---

## Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Backend | Node.js + Express | Lightweight, same language everywhere |
| Database | SQLite (better-sqlite3) | Zero config, single file, rock solid |
| Web Panel | Next.js 14 (Pages Router) | Fast dev, role-based routing |
| Desktop App | Electron 33 | Built-in desktopCapturer for screen recording |
| Screen Capture | desktopCapturer + MediaRecorder | Native to Electron, no dependencies |
| Video Format | WebM (VP8) | Browser-native playback, good compression |
| Video Processing | ffmpeg | Remux for seekable playback, thumbnail generation |
| Auth | JWT (24h expiry) | Stateless, works for desktop + web |
| Process Manager | PM2 | Auto-restart on crash, startup on boot |
| Reverse Proxy | Nginx | SSL termination, routing, static files |
| Desktop Builds | GitHub Actions | Real Windows machine, automatic on push |

---

## Features

### Desktop App (Employee)
- Login with username/password
- Start/Stop/Pause/Resume timer
- Work date picker (last 7 days, for midnight shifts)
- Screen recording at 720p, ~1 FPS, VP8/WebM
- 5-minute auto-chunking with upload
- Heartbeat every 60 seconds (updates duration on server)
- Idle detection (5 min) with auto-pause
- Minimize to system tray
- "Open Dashboard" button opens web panel in browser
- All API calls through Node.js IPC (not browser fetch)

### Web Dashboard (Employee View)
- Today's hours and this week's hours
- Daily summary with session count
- View recordings as screenshot grid grouped by hour
- Click any screenshot to play the recording

### Web Dashboard (Admin View)
- Team overview: all employees, online/offline status, today/week hours
- Employee detail: date picker, daily summary, screenshot timeline, video playback
- Employee management: add, edit, deactivate, reset password
- Reports: date-range team summary, daily breakdown, CSV export
- Storage management: disk usage, monthly breakdown, one-click cleanup

### Server Features
- Stale session cleanup (auto-completes sessions with no heartbeat for 5+ min)
- ffmpeg remux on upload (adds seek metadata to WebM)
- Thumbnail generation on-demand from recordings
- Rate limiting on login endpoint
- All times displayed in Pakistan Standard Time (Asia/Karachi)

---

## Recording Specs

| Setting | Value |
|---------|-------|
| Resolution | 720p (1280x720) |
| Frame Rate | ~1 FPS |
| Format | WebM (VP8) |
| Bitrate | 200 kbps |
| Chunk Duration | 5 minutes |
| Est. Size | ~15-30 MB per hour |
| Storage/employee/day (4h) | ~120 MB |
| Storage/month (4 employees) | ~12.5 GB |

---

## File Structure

```
timedoc/
├── DOCUMENTATION.md              # This file
├── .gitignore
├── ecosystem.config.js           # PM2 config for API + web
│
├── .github/
│   └── workflows/
│       └── build-desktop.yml     # GitHub Actions: builds .exe on Windows
│
├── server/                       # BACKEND API (Node.js + Express)
│   ├── package.json              # Dependencies: express, better-sqlite3, bcryptjs, jsonwebtoken, multer, cors, express-rate-limit
│   ├── index.js                  # Express entry point, middleware, routing (port 3001)
│   ├── db.js                     # SQLite setup, table creation, admin seed, stale session cleanup
│   ├── middleware/
│   │   ├── auth.js               # JWT verification middleware
│   │   └── admin.js              # Admin role check middleware
│   ├── routes/
│   │   ├── auth.js               # POST /login, GET /me
│   │   ├── sessions.js           # start, stop, pause, resume, heartbeat, active, list
│   │   ├── recordings.js         # upload chunk (with ffmpeg remux), stream video, generate thumbnail
│   │   └── admin.js              # dashboard, employee CRUD, reports, CSV export, storage management
│   ├── uploads/                  # Screen recordings stored here (organized by session ID)
│   │   └── {session_id}/
│   │       ├── chunk_1.webm
│   │       ├── chunk_1_thumb.jpg # Auto-generated thumbnail
│   │       └── ...
│   └── timedoc.db                # SQLite database (auto-created)
│
├── web/                          # WEB DASHBOARD (Next.js 14)
│   ├── package.json              # Dependencies: next, react, react-dom
│   ├── next.config.js            # API proxy rewrite to localhost:3001
│   ├── styles/
│   │   └── globals.css           # All CSS: layout, cards, tables, buttons, timeline, date-nav
│   ├── lib/
│   │   └── api.js                # API client: auth, sessions, admin, recordings helpers
│   ├── components/
│   │   ├── Layout.js             # Nav bar (role-based links), logout
│   │   ├── SessionTable.js       # Session list, time formatting, PKT timezone helpers
│   │   └── VideoPlayer.js        # Modal video player with auth token
│   ├── pages/
│   │   ├── _app.js               # Global CSS import
│   │   ├── _document.js          # Favicon, meta tags
│   │   ├── index.js              # Auto-redirect by role (admin/employee)
│   │   ├── login.js              # Login form
│   │   ├── dashboard.js          # Employee: today/week stats, daily summary
│   │   ├── sessions/
│   │   │   └── [date].js         # Employee: screenshot timeline for a date
│   │   └── admin/
│   │       ├── index.js          # Admin dashboard: team overview, online status
│   │       ├── employee/
│   │       │   └── [id].js       # Admin: employee detail, date picker, screenshot timeline
│   │       ├── manage.js         # Admin: add/edit/deactivate employees
│   │       ├── reports.js        # Admin: team reports, CSV export
│   │       └── storage.js        # Admin: disk usage, cleanup old recordings
│   └── public/
│       └── favicon.png           # Browser tab icon
│
└── desktop-app/                  # DESKTOP APP (Electron)
    ├── package.json              # Dependencies: electron, electron-builder + build config
    ├── main.js                   # Main process: window, tray, IPC handlers, idle detection, shell.openExternal
    ├── preload.js                # Bridge: apiCall, getScreenSources, idle monitoring, openExternal
    ├── src/
    │   ├── auth.js               # Node.js HTTP client for all API calls (login, sessions, heartbeat)
    │   ├── uploader.js           # Multipart upload with 3x retry logic
    │   └── idle.js               # Idle threshold constant
    └── renderer/
        ├── index.html            # Login + timer screens with SVG icons
        ├── style.css             # Premium UI: cards, gradients, shadows, animations
        ├── app.js                # All UI logic: login, timer, recording, chunking, upload
        └── icon.png              # App icon (256x256 blue clock)
```

---

## Database Schema

### users
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| username | TEXT UNIQUE | Login username |
| password_hash | TEXT | Bcrypt hashed |
| display_name | TEXT | Shown in UI |
| role | TEXT | 'employee' or 'admin' |
| is_active | INTEGER | 1=active, 0=deactivated |
| created_at | DATETIME | Account creation |

### sessions
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| user_id | INTEGER FK | References users.id |
| work_date | DATE | Selected work date (midnight shift support) |
| start_time | DATETIME | Actual start (UTC) |
| end_time | DATETIME | Actual end (UTC) |
| duration_minutes | INTEGER | Total worked minutes |
| break_minutes | INTEGER | Total break time |
| status | TEXT | 'active', 'paused', 'completed' |
| paused_at | DATETIME | When pause started |
| last_heartbeat | DATETIME | Last heartbeat from desktop app |

### recording_chunks
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| session_id | INTEGER FK | References sessions.id |
| chunk_number | INTEGER | Sequential (1, 2, 3...) |
| file_path | TEXT | Relative path in uploads/ |
| file_size_mb | REAL | File size |
| start_time | DATETIME | Chunk start |
| end_time | DATETIME | Chunk end |
| uploaded_at | DATETIME | When received |

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login | Login, returns JWT |
| GET | /api/auth/me | Current user info |

### Sessions
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/sessions/start | Start session (body: work_date) |
| POST | /api/sessions/stop | Stop active session |
| POST | /api/sessions/pause | Pause (break) |
| POST | /api/sessions/resume | Resume from break |
| POST | /api/sessions/heartbeat | Update duration (every 60s) |
| GET | /api/sessions/active | Current active session |
| GET | /api/sessions/my?from=&to= | Own sessions in date range |
| GET | /api/sessions/:id | Session detail with chunks |

### Recordings
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/recordings/upload | Upload 5-min chunk (multipart) |
| GET | /api/recordings/:id/stream | Stream video (supports range + token query) |
| GET | /api/recordings/:id/thumbnail | Get/generate JPEG thumbnail |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/admin/dashboard | All employees + hours + online status |
| GET | /api/admin/employees | List all employees |
| POST | /api/admin/employees | Add employee |
| PUT | /api/admin/employees/:id | Update employee |
| DELETE | /api/admin/employees/:id | Deactivate employee |
| GET | /api/admin/employees/:id/sessions | Employee's sessions |
| GET | /api/admin/reports?from=&to= | Team report |
| GET | /api/admin/reports/csv?from=&to= | CSV export |
| GET | /api/admin/storage | Disk usage stats |
| DELETE | /api/admin/storage/cleanup?before= | Delete old recordings |

---

## How It Works

### Recording Flow
1. Employee clicks Start in desktop app
2. `desktopCapturer` captures screen at 720p, ~1 FPS
3. `MediaRecorder` records as WebM (VP8, 200kbps)
4. Every 5 minutes: `requestData()` + `stop()` flushes the chunk
5. Chunk blob converted to base64, sent via IPC to main process
6. Main process uploads as multipart/form-data to server
7. Server remuxes with `ffmpeg -c copy` (adds seek metadata)
8. Server stores in `uploads/{session_id}/chunk_{n}.webm`
9. New chunk starts immediately, process repeats

### Heartbeat Flow
1. Desktop app sends POST /api/sessions/heartbeat every 60 seconds
2. Server recalculates duration_minutes from start_time and updates last_heartbeat
3. If no heartbeat for 5 minutes, stale cleanup marks session as completed

### Why IPC for API Calls
Electron's renderer process loads from `file://` protocol. Chromium silently blocks `fetch()` from `file://` to `http://` URLs. All API calls go through IPC to the main process which uses Node.js `http` module.

### Why ffmpeg Remux
MediaRecorder produces WebM without duration metadata or seek cues. Browsers can play it but can't seek (forward/rewind). Running `ffmpeg -i input.webm -c copy output.webm` adds proper metadata without re-encoding.

---

## Deployment

### Server (Contabo VPS)
- **OS:** Ubuntu 22.04
- **IP:** 109.205.181.13
- **Process Manager:** PM2 (auto-restart + startup on boot)
- **Reverse Proxy:** Nginx (port 80 -> API:3001 + Web:3000)
- **Config:** /etc/nginx/sites-available/timedoc
- **PM2 Config:** /home/claude/timedoc/ecosystem.config.js

### Desktop App Builds
- Pushed to GitHub: github.com/hiafrasiabali/timedoc (private)
- GitHub Actions builds .exe on real Windows automatically
- electron-builder creates NSIS installer + publishes to GitHub Releases
- Download latest: GitHub Releases page

### Key Commands
```bash
# Check status
pm2 status

# View logs
pm2 logs timedoc-api
pm2 logs timedoc-web

# Restart
pm2 restart timedoc-api
pm2 restart timedoc-web

# Rebuild web panel after code changes
cd /home/claude/timedoc/web && npx next build && pm2 restart timedoc-web

# Restart API after code changes
pm2 restart timedoc-api
```

---

## Accounts

### Admin
- **Username:** admin
- **Password:** (set during initial setup, stored as bcrypt hash)

### Adding Employees
Login as admin > Employees > Add Employee

---

## Maintenance

### Storage Cleanup
Admin dashboard > Storage > Select date > Delete Old Recordings

### Disk Space
~12.5 GB/month (4 employees, 4 hours/day). VPS has 145 GB total.

### Server Reboot
PM2 is configured to auto-start. Nothing needed.

### App Crashes
PM2 auto-restarts within seconds. Desktop app shows connection error and retries.

---

## Known Behaviors

1. **Internet loss during recording:** Session auto-completes after 5 min of no heartbeat. Employee needs to Stop and Start again when internet returns.
2. **Computer sleep:** Same as internet loss - session auto-completes.
3. **Midnight shifts:** Employee selects the work date when starting. All hours count under that date.
4. **Multiple monitors:** Records primary screen only.
5. **Old app running in tray:** Must quit old version before installing new one, otherwise old app may interfere.

---

## Version History

| Version | Changes |
|---------|---------|
| 1.0.0 | Initial release |
| 1.1.0 | Fix login (was syntax error breaking all JS), direct fetch for API |
| 1.2.0 | All API calls via Node.js IPC (fix Electron fetch blocking) |
| 1.3.0 | Added auto-update (later removed) |
| 1.4.0 | Fix datetime format mismatch killing sessions |
| 1.4.1 | Added debug console for troubleshooting |
| 1.4.2 | Removed auto-stop on quit (was killing new sessions) |
| 1.5.0 | Premium UI redesign, better icon, Open Dashboard link |
| 1.5.1 | Hidden server URL field |
| 1.5.2 | Fixed Open Dashboard (IPC for shell.openExternal) |
