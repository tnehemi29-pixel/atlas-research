import type { SafeUser } from '@/lib/auth/schemas';
import { ApiError } from './companies';

async function parseOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? fallbackMessage, response.status);
  }
  return (await response.json()) as T;
}

function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export async function registerUser(input: { email: string; password: string; name?: string }): Promise<SafeUser> {
  const response = await postJson('/api/auth/register', input);
  return parseOrThrow<SafeUser>(response, 'Failed to register.');
}

export async function loginUser(input: { email: string; password: string }): Promise<SafeUser> {
  const response = await postJson('/api/auth/login', input);
  return parseOrThrow<SafeUser>(response, 'Failed to log in.');
}

export async function logoutUser(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
}

export async function fetchCurrentUser(signal?: AbortSignal): Promise<SafeUser | null> {
  const response = await fetch('/api/auth/me', { signal });
  const data = await parseOrThrow<{ user: SafeUser | null }>(response, 'Failed to load session.');
  return data.user;
}
