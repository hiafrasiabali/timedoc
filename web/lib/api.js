const API_BASE = '/api';

function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('timedoc_token');
}

function getUser() {
  if (typeof window === 'undefined') return null;
  const u = localStorage.getItem('timedoc_user');
  return u ? JSON.parse(u) : null;
}

function setAuth(token, user) {
  localStorage.setItem('timedoc_token', token);
  localStorage.setItem('timedoc_user', JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem('timedoc_token');
  localStorage.removeItem('timedoc_user');
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearAuth();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }

  if (res.headers.get('content-type')?.includes('text/csv')) {
    return res;
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Auth
export const login = (username, password) =>
  apiFetch('/auth/login', { method: 'POST', body: { username, password } });

export const getMe = () => apiFetch('/auth/me');

// Sessions
export const getMySessions = (from, to) =>
  apiFetch(`/sessions/my?from=${from}&to=${to}`);

export const getSession = (id) => apiFetch(`/sessions/${id}`);

// Admin
export const getAdminDashboard = () => apiFetch('/admin/dashboard');

export const getEmployees = () => apiFetch('/admin/employees');

export const createEmployee = (data) =>
  apiFetch('/admin/employees', { method: 'POST', body: data });

export const updateEmployee = (id, data) =>
  apiFetch(`/admin/employees/${id}`, { method: 'PUT', body: data });

export const deleteEmployee = (id) =>
  apiFetch(`/admin/employees/${id}`, { method: 'DELETE' });

export const getEmployeeSessions = (id, from, to) =>
  apiFetch(`/admin/employees/${id}/sessions?from=${from}&to=${to}`);

export const getReports = (from, to) =>
  apiFetch(`/admin/reports?from=${from}&to=${to}`);

export const downloadCSV = (from, to) =>
  apiFetch(`/admin/reports/csv?from=${from}&to=${to}`);

export const getRecordingStreamUrl = (chunkId) => {
  const token = getToken();
  return `${API_BASE}/recordings/${chunkId}/stream?token=${token}`;
};

export { getToken, getUser, setAuth, clearAuth };
