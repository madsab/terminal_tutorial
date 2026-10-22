import type { Os } from '../shared/protocol.js';

/** localStorage can throw (private windows, blocked storage), so every access is guarded. */
export function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* the page works without it */
  }
}

export function newClientId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `c-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

export function defaultOs(userAgent: string): Os {
  if (/windows/i.test(userAgent)) return 'windows';
  if (/linux|x11/i.test(userAgent) && !/android/i.test(userAgent)) return 'linux';
  return 'mac';
}

export interface Identity {
  clientId: string;
  name: string;
  os: Os | null;
}

export function loadIdentity(): Identity {
  let clientId = read('tq.clientId');
  if (!clientId) {
    clientId = newClientId();
    write('tq.clientId', clientId);
  }
  const os = read('tq.os');
  return { clientId, name: read('tq.name') ?? '', os: os === 'mac' || os === 'linux' || os === 'windows' ? os : null };
}

export function saveIdentity(name: string, os: Os): void {
  write('tq.name', name);
  write('tq.os', os);
}
