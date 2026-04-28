const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const wsBaseUrl = (import.meta.env.VITE_WS_BASE_URL || '').replace(/\/$/, '');
const productionApiFallback = 'https://meetings-vr93.onrender.com';
const productionWsFallback = 'wss://meetings-vr93.onrender.com';
const defaultIceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

function parseUrls(value) {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeIceServer(server) {
  if (!server || !server.urls) {
    return null;
  }

  const urls = Array.isArray(server.urls)
    ? server.urls.map((item) => `${item}`.trim()).filter(Boolean)
    : `${server.urls}`.split(',').map((item) => item.trim()).filter(Boolean);

  if (!urls.length) {
    return null;
  }

  return {
    urls: urls.length === 1 ? urls[0] : urls,
    ...(server.username ? { username: server.username } : {}),
    ...(server.credential ? { credential: server.credential } : {}),
    ...(server.credentialType ? { credentialType: server.credentialType } : {}),
  };
}

export function getIceServerConfig() {
  const rawIceServers = import.meta.env.VITE_ICE_SERVERS;

  if (rawIceServers) {
    try {
      const parsed = JSON.parse(rawIceServers);
      const iceServers = Array.isArray(parsed)
        ? parsed.map(normalizeIceServer).filter(Boolean)
        : [];

      if (iceServers.length) {
        return { iceServers };
      }
    } catch (error) {
      console.error('Failed to parse VITE_ICE_SERVERS.', error);
    }
  }

  const stunUrls = parseUrls(import.meta.env.VITE_STUN_URLS);
  const turnUrls = parseUrls(import.meta.env.VITE_TURN_URLS);
  const turnUsername = (import.meta.env.VITE_TURN_USERNAME || '').trim();
  const turnCredential = (import.meta.env.VITE_TURN_CREDENTIAL || '').trim();

  const iceServers = [
    ...(stunUrls.length ? [{ urls: stunUrls.length === 1 ? stunUrls[0] : stunUrls }] : defaultIceServers),
    ...(turnUrls.length && turnUsername && turnCredential
      ? [{
          urls: turnUrls.length === 1 ? turnUrls[0] : turnUrls,
          username: turnUsername,
          credential: turnCredential,
        }]
      : []),
  ];

  return { iceServers };
}

function getDefaultApiBaseUrl() {
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (!isLocalhost) {
    return productionApiFallback;
  }

  // In local development, Vite runs on 517x while API/WebSocket run on 10000.
  // Defaulting to window.origin routes requests to Vite and breaks signaling.
  return `${window.location.protocol}//${window.location.hostname}:10000`;
}

function getDefaultWebSocketBaseUrl() {
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (!isLocalhost) {
    return productionWsFallback;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.hostname}:10000`;
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
