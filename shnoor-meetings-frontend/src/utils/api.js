const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const wsBaseUrl = (import.meta.env.VITE_WS_BASE_URL || '').replace(/\/$/, '');

function getDefaultApiBaseUrl() {
  return window.location.origin.replace(/\/$/, '');
}

function getDefaultWebSocketBaseUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
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
  return `${resolvedWsBaseUrl}${path}`;
}
