const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const wsBaseUrl = (import.meta.env.VITE_WS_BASE_URL || '').replace(/\/$/, '');
const productionApiFallback = 'https://meetings-vr93.onrender.com';
const productionWsFallback = 'wss://meetings-vr93.onrender.com';

function getDefaultApiBaseUrl() {
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (!isLocalhost) {
    return productionApiFallback;
  }

  return window.location.origin.replace(/\/$/, '');
}

function getDefaultWebSocketBaseUrl() {
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (!isLocalhost) {
    return productionWsFallback;
  }

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
