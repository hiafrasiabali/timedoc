const APP_VERSION = '1.1.1';

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
const versionDisplay = document.getElementById('version-display');

if (versionDisplay) versionDisplay.textContent = 'v' + APP_VERSION;

// ---- Direct API calls (no IPC needed) ----
async function apiCall(method, path, body) {
  const options = {
    method,
    headers: {},
  };

  if (token) {
    options.headers['Authorization'] = 'Bearer ' + token;
  }

  if (body) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const res = await fetch(serverUrl + path, options);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'HTTP ' + res.status);
  }

  return data;
}

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
    const label = i === 0 ? dateStr + ' (Today)' : i === 1 ? dateStr + ' (Yesterday)' : dateStr;
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
  return h + ':' + m + ':' + s;
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(function () {
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
    var sources = await window.timedoc.getScreenSources();
    if (!sources || sources.length === 0) {
      throw new Error('No screen sources found');
    }

    var screenSource = sources[0];
    var stream = await navigator.mediaDevices.getUserMedia({
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

    chunkInterval = setInterval(function () {
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

  try {
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp8',
      videoBitsPerSecond: 200000,
    });
  } catch (e) {
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  }

  mediaRecorder.ondataavailable = function (e) {
    if (e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  mediaRecorder.start(5000);
}

function uploadChunkToServer(blob, chunkNum, startTime, endTime) {
  uploadStatus.textContent = 'Uploading chunk #' + chunkNum + ' (' + (blob.size / 1024).toFixed(0) + ' KB)...';

  var formData = new FormData();
  formData.append('session_id', String(sessionId));
  formData.append('chunk_number', String(chunkNum));
  formData.append('start_time', startTime);
  formData.append('end_time', endTime);
  formData.append('chunk', blob, 'chunk_' + chunkNum + '.webm');

  fetch(serverUrl + '/api/recordings/upload', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token },
    body: formData,
  })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function () {
      uploadStatus.textContent = 'Chunk #' + chunkNum + ' uploaded';
      setTimeout(function () {
        if (uploadStatus.textContent === 'Chunk #' + chunkNum + ' uploaded') {
          uploadStatus.textContent = '';
        }
      }, 3000);
    })
    .catch(function (err) {
      uploadStatus.textContent = 'Chunk #' + chunkNum + ' failed: ' + err.message;
    });
}

function saveCurrentChunk() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;

  var currentChunkNum = chunkNumber;
  var currentStartTime = chunkStartTime;
  var currentChunks = recordedChunks;

  mediaRecorder.onstop = function () {
    var endTime = new Date().toISOString();
    if (currentChunks.length === 0) return;
    var blob = new Blob(currentChunks, { type: 'video/webm' });
    if (blob.size === 0) return;
    uploadChunkToServer(blob, currentChunkNum, currentStartTime, endTime);
  };

  mediaRecorder.requestData();
  mediaRecorder.stop();
}

function stopRecording() {
  if (chunkInterval) {
    clearInterval(chunkInterval);
    chunkInterval = null;
  }

  saveCurrentChunk();

  if (mediaRecorder && mediaRecorder.stream) {
    mediaRecorder.stream.getTracks().forEach(function (t) { t.stop(); });
  }

  mediaRecorder = null;
  recordingIndicator.style.display = 'none';
}

// ---- Idle Detection ----
if (window.timedoc && window.timedoc.onIdleDetected) {
  window.timedoc.onIdleDetected(function () {
    if (sessionStatus === 'active') {
      apiCall('POST', '/api/sessions/pause', {})
        .then(function () {
          sessionStatus = 'paused';
          pauseTimer();
          updateControls();
          timerStatus.textContent = 'Paused (idle detected)';
          timerStatus.className = 'timer-status paused';
        })
        .catch(function () {});
    }
  });
}

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
loginForm.addEventListener('submit', function (e) {
  e.preventDefault();
  loginError.textContent = '';
  loginBtn.textContent = 'Logging in...';
  loginBtn.disabled = true;

  serverUrl = document.getElementById('server-url').value.replace(/\/+$/, '');
  var username = document.getElementById('username').value;
  var password = document.getElementById('password').value;

  if (!serverUrl || !username || !password) {
    loginError.textContent = 'All fields are required';
    loginBtn.textContent = 'Login';
    loginBtn.disabled = false;
    return;
  }

  fetch(serverUrl + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: username, password: password }),
  })
    .then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Login failed');
        return data;
      });
    })
    .then(function (data) {
      token = data.token;
      user = data.user;
      localStorage.setItem('timedoc_server', serverUrl);

      displayName.textContent = user.display_name;
      populateWorkDates();
      resetTimer();
      sessionId = null;
      sessionStatus = null;
      updateControls();
      showScreen(timerScreen);
    })
    .catch(function (err) {
      loginError.textContent = err.message || 'Connection failed';
      loginBtn.textContent = 'Login';
      loginBtn.disabled = false;
    });
});

// Logout
logoutBtn.addEventListener('click', function () {
  if (sessionStatus) {
    if (!confirm('You have an active session. Stop and logout?')) return;
    handleStop();
  }
  token = '';
  user = null;
  showScreen(loginScreen);
});

// Start
startBtn.addEventListener('click', function () {
  startBtn.disabled = true;
  startBtn.textContent = 'Starting...';

  var workDate = workDateSelect.value;

  apiCall('POST', '/api/sessions/start', { work_date: workDate })
    .then(function (data) {
      sessionId = data.session.id;
      sessionStatus = 'active';
      elapsedSeconds = 0;
      startTimer();
      updateControls();

      // Notify main process for quit cleanup
      if (window.timedoc && window.timedoc.notifySessionStarted) {
        window.timedoc.notifySessionStarted(serverUrl, token);
      }

      startRecording();

      if (window.timedoc) window.timedoc.startIdleMonitoring(300);

      if (heartbeatInterval) clearInterval(heartbeatInterval);
      heartbeatInterval = setInterval(function () {
        apiCall('POST', '/api/sessions/heartbeat', {}).catch(function () {});
      }, 60000);
    })
    .catch(function (err) {
      alert('Failed to start: ' + err.message);
    })
    .finally(function () {
      startBtn.disabled = false;
      startBtn.textContent = 'Start';
    });
});

// Pause
pauseBtn.addEventListener('click', function () {
  apiCall('POST', '/api/sessions/pause', {})
    .then(function () {
      sessionStatus = 'paused';
      pauseTimer();
      updateControls();
    })
    .catch(function (err) {
      alert('Failed to pause: ' + err.message);
    });
});

// Resume
resumeBtn.addEventListener('click', function () {
  apiCall('POST', '/api/sessions/resume', {})
    .then(function () {
      sessionStatus = 'active';
      startTimer();
      updateControls();
    })
    .catch(function (err) {
      alert('Failed to resume: ' + err.message);
    });
});

// Stop
stopBtn.addEventListener('click', function () {
  if (!confirm('Stop this session?')) return;
  handleStop();
});

function handleStop() {
  stopRecording();
  if (window.timedoc) window.timedoc.stopIdleMonitoring();
  if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }

  apiCall('POST', '/api/sessions/stop', {})
    .then(function () {
      sessionStatus = null;
      sessionId = null;
      pauseTimer();
      updateControls();
      uploadStatus.textContent = 'Session completed';
      setTimeout(function () { uploadStatus.textContent = ''; }, 3000);

      if (window.timedoc && window.timedoc.notifySessionStopped) {
        window.timedoc.notifySessionStopped();
      }
    })
    .catch(function (err) {
      alert('Failed to stop: ' + err.message);
    });
}

// ---- Init ----
var savedServer = localStorage.getItem('timedoc_server');
if (savedServer) {
  document.getElementById('server-url').value = savedServer;
}
