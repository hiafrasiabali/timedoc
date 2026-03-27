const https = require('https');
const http = require('http');

function apiRequest(serverUrl, method, path, token, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, serverUrl);
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(json.error || `HTTP ${res.statusCode}`));
          } else {
            resolve(json);
          }
        } catch {
          reject(new Error(`Invalid response: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function login(serverUrl, username, password) {
  return apiRequest(serverUrl, 'POST', '/api/auth/login', null, { username, password });
}

async function startSession(serverUrl, token, workDate) {
  return apiRequest(serverUrl, 'POST', '/api/sessions/start', token, { work_date: workDate });
}

async function stopSession(serverUrl, token) {
  return apiRequest(serverUrl, 'POST', '/api/sessions/stop', token, {});
}

async function pauseSession(serverUrl, token) {
  return apiRequest(serverUrl, 'POST', '/api/sessions/pause', token, {});
}

async function resumeSession(serverUrl, token) {
  return apiRequest(serverUrl, 'POST', '/api/sessions/resume', token, {});
}

module.exports = { login, startSession, stopSession, pauseSession, resumeSession };
