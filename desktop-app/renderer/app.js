var APP_VERSION = '1.5.0';

// ---- State ----
var serverUrl = '';
var token = '';
var user = null;
var sessionId = null;
var sessionStatus = null;

// Timer
var timerInterval = null;
var elapsedSeconds = 0;
var heartbeatInterval = null;

// Recording
var mediaRecorder = null;
var recordedChunks = [];
var chunkNumber = 0;
var chunkStartTime = null;
var chunkInterval = null;
var CHUNK_DURATION_MS = 5 * 60 * 1000;

// ---- DOM ----
var loginScreen = document.getElementById('login-screen');
var timerScreen = document.getElementById('timer-screen');
var loginForm = document.getElementById('login-form');
var loginError = document.getElementById('login-error');
var loginBtn = document.getElementById('login-btn');
var displayNameEl = document.getElementById('display-name');
var userAvatar = document.getElementById('user-avatar');
var dashboardLink = document.getElementById('dashboard-link');
var logoutBtn = document.getElementById('logout-btn');
var timerDisplay = document.getElementById('timer-display');
var timerStatusEl = document.getElementById('timer-status');
var workDateSelect = document.getElementById('work-date');
var startBtn = document.getElementById('start-btn');
var pauseBtn = document.getElementById('pause-btn');
var resumeBtn = document.getElementById('resume-btn');
var stopBtn = document.getElementById('stop-btn');
var uploadStatusEl = document.getElementById('upload-status');
var recordingIndicator = document.getElementById('recording-indicator');
var versionDisplay = document.getElementById('version-display');

if (versionDisplay) versionDisplay.textContent = 'v' + APP_VERSION;

// ---- API helper ----
function api(method, path, body) {
  return window.timedoc.apiCall(method, path, body || {}).then(function (result) {
    if (!result.ok) throw new Error(result.error || 'Request failed');
    return result.data;
  });
}

// ---- Screens ----
function showScreen(screen) {
  loginScreen.classList.remove('active');
  timerScreen.classList.remove('active');
  screen.classList.add('active');
}

// ---- Work Dates ----
function populateWorkDates() {
  workDateSelect.innerHTML = '';
  var today = new Date();
  for (var i = 0; i < 7; i++) {
    var d = new Date(today);
    d.setDate(today.getDate() - i);
    var dateStr = d.toISOString().slice(0, 10);
    var label = i === 0 ? dateStr + ' (Today)' : i === 1 ? dateStr + ' (Yesterday)' : dateStr;
    var opt = document.createElement('option');
    opt.value = dateStr;
    opt.textContent = label;
    workDateSelect.appendChild(opt);
  }
}

// ---- Timer ----
function formatTime(s) {
  var h = String(Math.floor(s / 3600)).padStart(2, '0');
  var m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  var sec = String(s % 60).padStart(2, '0');
  return h + ':' + m + ':' + sec;
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(function () {
    elapsedSeconds++;
    timerDisplay.textContent = formatTime(elapsedSeconds);
  }, 1000);
}

function pauseTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function resetTimer() {
  pauseTimer();
  elapsedSeconds = 0;
  timerDisplay.textContent = '00:00:00';
}

// ---- Recording ----
function startRecording() {
  window.timedoc.getScreenSources().then(function (sources) {
    if (!sources || sources.length === 0) {
      uploadStatusEl.textContent = 'No screen source found';
      return;
    }
    return navigator.mediaDevices.getUserMedia({
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sources[0].id,
          maxWidth: 1280,
          maxHeight: 720,
          maxFrameRate: 1,
        },
      },
      audio: false,
    });
  }).then(function (stream) {
    if (!stream) return;
    chunkNumber = 0;
    startNewChunk(stream);
    chunkInterval = setInterval(function () {
      saveCurrentChunk();
      startNewChunk(stream);
    }, CHUNK_DURATION_MS);
    recordingIndicator.style.display = 'flex';
  }).catch(function (err) {
    uploadStatusEl.textContent = 'Recording failed: ' + err.message;
  });
}

function startNewChunk(stream) {
  chunkNumber++;
  recordedChunks = [];
  chunkStartTime = new Date().toISOString();
  try {
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 200000 });
  } catch (e) {
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  }
  mediaRecorder.ondataavailable = function (e) {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.start(5000);
}

function saveCurrentChunk() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  var num = chunkNumber;
  var start = chunkStartTime;
  var chunks = recordedChunks;

  mediaRecorder.onstop = function () {
    var end = new Date().toISOString();
    if (chunks.length === 0) return;
    var blob = new Blob(chunks, { type: 'video/webm' });
    if (blob.size === 0) return;
    uploadChunk(blob, num, start, end);
  };
  mediaRecorder.requestData();
  mediaRecorder.stop();
}

function uploadChunk(blob, num, start, end) {
  uploadStatusEl.textContent = 'Uploading chunk #' + num + ' (' + Math.round(blob.size / 1024) + ' KB)...';

  // Convert to base64 and send via IPC to main process
  var reader = new FileReader();
  reader.onload = function () {
    var base64 = reader.result.split(',')[1];
    window.timedoc.apiCall('UPLOAD', '/api/recordings/upload', {
      sessionId: sessionId,
      chunkNumber: num,
      startTime: start,
      endTime: end,
      base64Data: base64,
    }).then(function (result) {
      if (result.ok) {
        uploadStatusEl.textContent = 'Chunk #' + num + ' uploaded';
        setTimeout(function () {
          if (uploadStatusEl.textContent === 'Chunk #' + num + ' uploaded') uploadStatusEl.textContent = '';
        }, 3000);
      } else {
        uploadStatusEl.textContent = 'Chunk #' + num + ' failed: ' + (result.error || '');
      }
    });
  };
  reader.readAsDataURL(blob);
}

function stopRecording() {
  if (chunkInterval) { clearInterval(chunkInterval); chunkInterval = null; }
  saveCurrentChunk();
  if (mediaRecorder && mediaRecorder.stream) {
    mediaRecorder.stream.getTracks().forEach(function (t) { t.stop(); });
  }
  mediaRecorder = null;
  recordingIndicator.style.display = 'none';
}

// ---- Idle Detection ----
if (window.timedoc.onIdleDetected) {
  window.timedoc.onIdleDetected(function () {
    if (sessionStatus === 'active') {
      api('POST', '/api/sessions/pause').then(function () {
        sessionStatus = 'paused';
        pauseTimer();
        updateControls();
        timerStatusEl.textContent = 'Paused (idle)';
        timerStatusEl.className = 'timer-status paused';
      }).catch(function () {});
    }
  });
}

// ---- Controls ----
function updateControls() {
  startBtn.style.display = sessionStatus ? 'none' : 'block';
  pauseBtn.style.display = sessionStatus === 'active' ? 'block' : 'none';
  resumeBtn.style.display = sessionStatus === 'paused' ? 'block' : 'none';
  stopBtn.style.display = sessionStatus ? 'block' : 'none';
  workDateSelect.disabled = !!sessionStatus;

  if (sessionStatus === 'active') {
    timerStatusEl.textContent = 'Working';
    timerStatusEl.className = 'timer-status active';
  } else if (sessionStatus === 'paused') {
    timerStatusEl.textContent = 'On Break';
    timerStatusEl.className = 'timer-status paused';
  } else {
    timerStatusEl.textContent = 'Ready';
    timerStatusEl.className = 'timer-status';
  }
}

// ---- Login ----
loginForm.addEventListener('submit', function (e) {
  e.preventDefault();
  loginError.textContent = '';

  serverUrl = document.getElementById('server-url').value.replace(/\/+$/, '');
  var username = document.getElementById('username').value;
  var password = document.getElementById('password').value;

  if (!serverUrl || !username || !password) {
    loginError.textContent = 'All fields are required';
    return;
  }

  loginBtn.textContent = 'Logging in...';
  loginBtn.disabled = true;

  // Tell main process the server URL first
  window.timedoc.apiCall('SET_SERVER', serverUrl, {}).then(function () {
    return api('POST', '/api/auth/login', { username: username, password: password });
  }).then(function (data) {
    token = data.token;
    user = data.user;
    localStorage.setItem('timedoc_server', serverUrl);
    displayNameEl.textContent = user.display_name;
    if (userAvatar) userAvatar.textContent = user.display_name.charAt(0).toUpperCase();
    if (dashboardLink) dashboardLink.onclick = function (e) {
      e.preventDefault();
      window.timedoc.openExternal(serverUrl);
    };
    populateWorkDates();
    resetTimer();
    sessionId = null;
    sessionStatus = null;
    updateControls();
    showScreen(timerScreen);
  }).catch(function (err) {
    loginError.textContent = err.message || 'Connection failed';
  }).finally(function () {
    loginBtn.textContent = 'Login';
    loginBtn.disabled = false;
  });
});

// ---- Logout ----
logoutBtn.addEventListener('click', function () {
  if (sessionStatus) {
    if (!confirm('Stop session and logout?')) return;
    handleStop();
  }
  token = '';
  user = null;
  showScreen(loginScreen);
});

// ---- Start ----
startBtn.addEventListener('click', function () {
  startBtn.disabled = true;
  startBtn.textContent = 'Starting...';

  api('POST', '/api/sessions/start', { work_date: workDateSelect.value })
    .then(function (data) {
      sessionId = data.session.id;
      sessionStatus = 'active';
      elapsedSeconds = 0;
      startTimer();
      updateControls();
      startRecording();
      window.timedoc.startIdleMonitoring(300);

      if (heartbeatInterval) clearInterval(heartbeatInterval);
      heartbeatInterval = setInterval(function () {
        api('POST', '/api/sessions/heartbeat').catch(function () {});
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

// ---- Pause ----
pauseBtn.addEventListener('click', function () {
  api('POST', '/api/sessions/pause').then(function () {
    sessionStatus = 'paused';
    pauseTimer();
    updateControls();
  }).catch(function (err) { alert('Pause failed: ' + err.message); });
});

// ---- Resume ----
resumeBtn.addEventListener('click', function () {
  api('POST', '/api/sessions/resume').then(function () {
    sessionStatus = 'active';
    startTimer();
    updateControls();
  }).catch(function (err) { alert('Resume failed: ' + err.message); });
});

// ---- Stop ----
stopBtn.addEventListener('click', function () {
  if (!confirm('Stop this session?')) return;
  handleStop();
});

function handleStop() {
  stopRecording();
  window.timedoc.stopIdleMonitoring();
  if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }

  api('POST', '/api/sessions/stop').then(function () {
    sessionStatus = null;
    sessionId = null;
    pauseTimer();
    updateControls();
    uploadStatusEl.textContent = 'Session completed';
    setTimeout(function () { uploadStatusEl.textContent = ''; }, 3000);
  }).catch(function (err) { alert('Stop failed: ' + err.message); });
}

// ---- Init ----
var saved = localStorage.getItem('timedoc_server');
if (saved) document.getElementById('server-url').value = saved;
