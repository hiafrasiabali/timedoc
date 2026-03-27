// ---- State ----
let serverUrl = '';
let token = '';
let user = null;
let sessionId = null;
let sessionStatus = null; // 'active', 'paused', null

// Timer
let timerInterval = null;
let elapsedSeconds = 0;
let heartbeatInterval = null;

// Recording
let mediaRecorder = null;
let recordedChunks = [];
let chunkNumber = 0;
let chunkStartTime = null;
let chunkInterval = null;
const CHUNK_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// ---- DOM Elements ----
const loginScreen = document.getElementById('login-screen');
const timerScreen = document.getElementById('timer-screen');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginBtn = document.getElementById('login-btn');
const displayName = document.getElementById('display-name');
const logoutBtn = document.getElementById('logout-btn');
const timerDisplay = document.getElementById('timer-display');
const timerStatus = document.getElementById('timer-status');
const workDateSelect = document.getElementById('work-date');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const resumeBtn = document.getElementById('resume-btn');
const stopBtn = document.getElementById('stop-btn');
const uploadStatus = document.getElementById('upload-status');
const recordingIndicator = document.getElementById('recording-indicator');

// ---- Screens ----
function showScreen(screen) {
  loginScreen.classList.remove('active');
  timerScreen.classList.remove('active');
  screen.classList.add('active');
}

// ---- Work Date Dropdown ----
function populateWorkDates() {
  workDateSelect.innerHTML = '';
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const label = i === 0 ? `${dateStr} (Today)` : i === 1 ? `${dateStr} (Yesterday)` : dateStr;
    const opt = document.createElement('option');
    opt.value = dateStr;
    opt.textContent = label;
    workDateSelect.appendChild(opt);
  }
}

// ---- Timer ----
function formatTime(seconds) {
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    elapsedSeconds++;
    timerDisplay.textContent = formatTime(elapsedSeconds);
  }, 1000);
}

function pauseTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function resetTimer() {
  pauseTimer();
  elapsedSeconds = 0;
  timerDisplay.textContent = '00:00:00';
}

// ---- Recording ----
async function startRecording() {
  try {
    // Use Electron's desktopCapturer to get screen source
    const sources = await window.timedoc.getScreenSources();
    if (!sources || sources.length === 0) {
      throw new Error('No screen sources found');
    }

    const screenSource = sources[0]; // Primary screen
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: screenSource.id,
          maxWidth: 1280,
          maxHeight: 720,
          maxFrameRate: 1,
        },
      },
      audio: false,
    });

    chunkNumber = 0;
    startNewChunk(stream);

    // Every 5 minutes, save current chunk and start new one
    chunkInterval = setInterval(() => {
      saveCurrentChunk();
      startNewChunk(stream);
    }, CHUNK_DURATION_MS);

    recordingIndicator.style.display = 'flex';
  } catch (err) {
    console.error('Recording failed:', err);
    uploadStatus.textContent = 'Screen recording failed: ' + err.message;
  }
}

function startNewChunk(stream) {
  chunkNumber++;
  recordedChunks = [];
  chunkStartTime = new Date().toISOString();

  // Use a lower bitrate for smaller files
  const options = { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 200000 };

  try {
    mediaRecorder = new MediaRecorder(stream, options);
  } catch {
    // Fallback if vp8 not supported
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  mediaRecorder.start(10000); // Collect data every 10 seconds
}

function saveCurrentChunk() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;

  const currentChunkNum = chunkNumber;
  const currentStartTime = chunkStartTime;

  mediaRecorder.stop();

  // Small delay to let final data arrive
  setTimeout(() => {
    if (recordedChunks.length === 0) return;

    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const endTime = new Date().toISOString();

    // Upload directly from renderer using fetch (no IPC base64 corruption)
    uploadStatus.textContent = `Uploading chunk #${currentChunkNum}...`;

    const formData = new FormData();
    formData.append('session_id', String(sessionId));
    formData.append('chunk_number', String(currentChunkNum));
    formData.append('start_time', currentStartTime);
    formData.append('end_time', endTime);
    formData.append('chunk', blob, `chunk_${currentChunkNum}.webm`);

    fetch(`${serverUrl}/api/recordings/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(() => {
        uploadStatus.textContent = `Chunk #${currentChunkNum} uploaded`;
        setTimeout(() => {
          if (uploadStatus.textContent === `Chunk #${currentChunkNum} uploaded`) {
            uploadStatus.textContent = '';
          }
        }, 3000);
      })
      .catch((err) => {
        uploadStatus.textContent = `Chunk #${currentChunkNum} failed: ${err.message}`;
        // Retry once after 5 seconds
        setTimeout(() => {
          uploadStatus.textContent = `Retrying chunk #${currentChunkNum}...`;
          fetch(`${serverUrl}/api/recordings/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
          })
            .then((res) => {
              if (res.ok) uploadStatus.textContent = `Chunk #${currentChunkNum} uploaded (retry)`;
              else uploadStatus.textContent = `Chunk #${currentChunkNum} retry failed`;
            })
            .catch(() => {
              uploadStatus.textContent = `Chunk #${currentChunkNum} retry failed`;
            });
        }, 5000);
      });
  }, 500);
}

function stopRecording() {
  if (chunkInterval) {
    clearInterval(chunkInterval);
    chunkInterval = null;
  }

  // Save final chunk
  saveCurrentChunk();

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }

  // Stop all tracks
  if (mediaRecorder && mediaRecorder.stream) {
    mediaRecorder.stream.getTracks().forEach((t) => t.stop());
  }

  mediaRecorder = null;
  recordingIndicator.style.display = 'none';
}

// ---- Upload Feedback ----
window.timedoc.onChunkUploaded((data) => {
  if (data.success) {
    uploadStatus.textContent = `Chunk #${data.chunkNumber} uploaded`;
    setTimeout(() => {
      if (uploadStatus.textContent === `Chunk #${data.chunkNumber} uploaded`) {
        uploadStatus.textContent = '';
      }
    }, 3000);
  } else {
    uploadStatus.textContent = `Chunk #${data.chunkNumber} failed: ${data.error}`;
  }
});

// ---- Idle Detection ----
window.timedoc.onIdleDetected(async (data) => {
  if (sessionStatus === 'active') {
    // Auto-pause on idle
    try {
      await window.timedoc.pauseSession(serverUrl, token);
      sessionStatus = 'paused';
      pauseTimer();
      updateControls();
      timerStatus.textContent = 'Paused (idle detected)';
      timerStatus.className = 'timer-status paused';
    } catch (err) {
      console.error('Auto-pause failed:', err);
    }
  }
});

// ---- UI Controls ----
function updateControls() {
  if (sessionStatus === 'active') {
    startBtn.style.display = 'none';
    pauseBtn.style.display = 'block';
    resumeBtn.style.display = 'none';
    stopBtn.style.display = 'block';
    workDateSelect.disabled = true;
    timerStatus.textContent = 'Working';
    timerStatus.className = 'timer-status active';
  } else if (sessionStatus === 'paused') {
    startBtn.style.display = 'none';
    pauseBtn.style.display = 'none';
    resumeBtn.style.display = 'block';
    stopBtn.style.display = 'block';
    workDateSelect.disabled = true;
    if (!timerStatus.textContent.includes('idle')) {
      timerStatus.textContent = 'On Break';
      timerStatus.className = 'timer-status paused';
    }
  } else {
    startBtn.style.display = 'block';
    pauseBtn.style.display = 'none';
    resumeBtn.style.display = 'none';
    stopBtn.style.display = 'none';
    workDateSelect.disabled = false;
    timerStatus.textContent = 'Ready';
    timerStatus.className = 'timer-status';
  }
}

// ---- Event Handlers ----

// Login
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  loginBtn.textContent = 'Logging in...';
  loginBtn.disabled = true;

  serverUrl = document.getElementById('server-url').value.replace(/\/+$/, '');
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  try {
    const result = await window.timedoc.login(serverUrl, username, password);
    token = result.token;
    user = result.user;

    // Save server URL for next launch
    localStorage.setItem('timedoc_server', serverUrl);

    displayName.textContent = user.display_name;
    populateWorkDates();
    resetTimer();
    sessionId = null;
    sessionStatus = null;
    updateControls();
    showScreen(timerScreen);
  } catch (err) {
    loginError.textContent = err.message;
  } finally {
    loginBtn.textContent = 'Login';
    loginBtn.disabled = false;
  }
});

// Logout
logoutBtn.addEventListener('click', () => {
  if (sessionStatus) {
    if (!confirm('You have an active session. Stop and logout?')) return;
    handleStop();
  }
  token = '';
  user = null;
  showScreen(loginScreen);
});

// Start
startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  startBtn.textContent = 'Starting...';

  try {
    const workDate = workDateSelect.value;
    const result = await window.timedoc.startSession(serverUrl, token, workDate);
    sessionId = result.session.id;
    sessionStatus = 'active';
    elapsedSeconds = 0;
    startTimer();
    updateControls();

    // Start recording
    await startRecording();

    // Start idle monitoring (5 min threshold)
    window.timedoc.startIdleMonitoring(300);

    // Start heartbeat - update duration on server every 60 seconds
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
      window.timedoc.sendHeartbeat(serverUrl, token).catch(() => {});
    }, 60000);
  } catch (err) {
    alert('Failed to start: ' + err.message);
  } finally {
    startBtn.disabled = false;
    startBtn.textContent = 'Start';
  }
});

// Pause
pauseBtn.addEventListener('click', async () => {
  try {
    await window.timedoc.pauseSession(serverUrl, token);
    sessionStatus = 'paused';
    pauseTimer();
    updateControls();
  } catch (err) {
    alert('Failed to pause: ' + err.message);
  }
});

// Resume
resumeBtn.addEventListener('click', async () => {
  try {
    await window.timedoc.resumeSession(serverUrl, token);
    sessionStatus = 'active';
    startTimer();
    updateControls();
  } catch (err) {
    alert('Failed to resume: ' + err.message);
  }
});

// Stop
stopBtn.addEventListener('click', () => {
  if (!confirm('Stop this session?')) return;
  handleStop();
});

async function handleStop() {
  try {
    stopRecording();
    window.timedoc.stopIdleMonitoring();
    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
    await window.timedoc.stopSession(serverUrl, token);
    sessionStatus = null;
    sessionId = null;
    pauseTimer();
    updateControls();
    uploadStatus.textContent = 'Session completed';
    setTimeout(() => (uploadStatus.textContent = ''), 3000);
  } catch (err) {
    alert('Failed to stop: ' + err.message);
  }
}

// ---- Init ----
const savedServer = localStorage.getItem('timedoc_server');
if (savedServer) {
  document.getElementById('server-url').value = savedServer;
}
