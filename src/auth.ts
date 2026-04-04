import { Env } from './types';

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';

export interface User {
  id: number;
  login: string;
  avatar_url: string;
  name: string | null;
}

export function getGitHubAuthURL(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'read:user',
  });
  return `${GITHUB_AUTH_URL}?${params}`;
}

export async function getGitHubToken(
  code: string,
  clientId: string,
  clientSecret: string
): Promise<string | null> {
  const res = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  const data = await res.json() as { access_token?: string };
  return data.access_token || null;
}

export async function getGitHubUser(accessToken: string): Promise<User | null> {
  const res = await fetch(GITHUB_USER_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'User-Agent': 'GrindMate',
    },
  });

  if (!res.ok) return null;
  return res.json() as Promise<User>;
}

export function createSessionToken(userId: string, secret: string): string {
  const timestamp = Date.now();
  const data = `${userId}:${timestamp}`;
  const signature = simpleHash(data + secret);
  return btoa(`${data}:${signature}`);
}

export function verifySessionToken(token: string, secret: string): string | null {
  try {
    const decoded = atob(token);
    const [userId, timestamp, signature] = decoded.split(':');
    
    const age = Date.now() - parseInt(timestamp);
    if (age > 7 * 24 * 60 * 60 * 1000) return null;
    
    const expectedSig = simpleHash(`${userId}:${timestamp}` + secret);
    if (signature !== expectedSig) return null;
    
    return userId;
  } catch {
    return null;
  }
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function getCookie(request: Request, name: string): string | null {
  const cookies = request.headers.get('Cookie') || '';
  const match = cookies.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

export function setCookie(name: string, value: string, maxAge: number = 604800, secure: boolean = false): string {
  const sameSite = secure ? 'None' : 'Lax';
  const secureFlag = secure ? '; Secure' : '';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=${sameSite}${secureFlag}; Max-Age=${maxAge}`;
}

export function clearCookie(name: string): string {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
