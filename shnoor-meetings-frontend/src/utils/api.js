const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const wsBaseUrl = (import.meta.env.VITE_WS_BASE_URL || '').replace(/\/$/, '');
const fallbackApiBaseUrl = 'https://meetings-vr93.onrender.com';
const fallbackWebSocketBaseUrl = 'wss://meetings-vr93.onrender.com';

function getDefaultApiBaseUrl() {
  return fallbackApiBaseUrl;
}

function getDefaultWebSocketBaseUrl() {
  return fallbackWebSocketBaseUrl;
}

export function buildApiUrl(path) {
  if (!path.startsWith('/')) {
    throw new Error(`API path must start with "/": ${path}`);
  }

  const resolvedApiBaseUrl = apiBaseUrl || getDefaultApiBaseUrl();
  return resolvedApiBaseUrl ? `${resolvedApiBaseUrl}${path}` : path;
}

export function buildWebSocketUrl(path) {
  if (!path.startsWith('/')) {
    throw new Error(`WebSocket path must start with "/": ${path}`);
  }

  const resolvedWsBaseUrl = wsBaseUrl || getDefaultWebSocketBaseUrl();
  if (resolvedWsBaseUrl) {
    return `${resolvedWsBaseUrl}${path}`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path}`;
}
