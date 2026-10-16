import { nativeClearSession, nativeSetSession } from './nativeBridge';

const TOKEN_KEY = 'cdmm.token';
const USERNAME_KEY = 'cdmm.username';
const CURSOR_KEY = 'cdmm.cursor';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getUsername(): string | null {
  try {
    return localStorage.getItem(USERNAME_KEY);
  } catch {
    return null;
  }
}

export function setSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
  nativeSetSession(token, username);
}

export function getCursor(): number {
  try {
    return Number(localStorage.getItem(CURSOR_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function setCursor(cursor: number): void {
  try {
    localStorage.setItem(CURSOR_KEY, String(cursor));
  } catch {
    // ignore
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
    localStorage.removeItem(CURSOR_KEY);
  } catch {
    // ignore
  }
  nativeClearSession();
}

/** Fired when the server rejects the token — the app must show the login screen. */
export function notifyUnauthorized(): void {
  window.dispatchEvent(new CustomEvent('cdmm:unauthorized'));
}

export function onUnauthorized(fn: () => void): () => void {
  const handler = () => fn();
  window.addEventListener('cdmm:unauthorized', handler);
  return () => window.removeEventListener('cdmm:unauthorized', handler);
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init.headers) {
    for (const [k, v] of Object.entries(init.headers as Record<string, string>)) headers[k] = v;
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(path, { ...init, headers });
  if (res.status === 401 && token) notifyUnauthorized();
  return res;
}

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.error === 'string') return data.error;
  } catch {
    // ignore
  }
  return `Request failed (${res.status})`;
}

export async function register(username: string, password: string): Promise<{ token: string; username: string }> {
  const res = await apiFetch('/api/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  setSession(data.token, data.username);
  setCursor(0);
  return data;
}

export async function login(username: string, password: string): Promise<{ token: string; username: string }> {
  const res = await apiFetch('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  setSession(data.token, data.username);
  setCursor(0);
  return data;
}

export async function logoutRemote(): Promise<void> {
  try {
    // Tell the server to stop pushing this account's reminders to this device.
    let pushEndpoint: string | null = null;
    try {
      pushEndpoint = localStorage.getItem('cdmm.pushEndpoint');
      localStorage.removeItem('cdmm.pushEndpoint');
    } catch {
      // ignore
    }
    await apiFetch('/api/logout', { method: 'POST', body: JSON.stringify({ pushEndpoint }) });
  } catch {
    // best effort — local session is cleared regardless
  }
}
