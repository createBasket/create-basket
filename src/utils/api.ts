import { Bracket } from '../types';
import { generateStartCode } from './startCode';

const baseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;

const requireBaseUrl = () => {
  if (!baseUrl) {
    throw new Error('Missing VITE_API_BASE_URL for AWS API');
  }
  return baseUrl.replace(/\/$/, '');
};

export const saveBracket = async (bracket: Bracket): Promise<Bracket> => {
  // Local fallback when no API is configured
  if (!baseUrl && typeof localStorage !== 'undefined') {
    const code = bracket.code || generateStartCode();
    const payload = { ...bracket, code, updatedAt: new Date().toISOString() };
    localStorage.setItem(`bracket-${code}`, JSON.stringify(payload));
    return payload;
  }

  const url = `${requireBaseUrl()}/brackets`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bracket)
  });

  if (!response.ok) {
    throw new Error(`Save failed (${response.status})`);
  }
  return response.json();
};

export const loadBracket = async (code: string): Promise<Bracket | null> => {
  if (!baseUrl && typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(`bracket-${code}`);
    return raw ? (JSON.parse(raw) as Bracket) : null;
  }

  const url = `${requireBaseUrl()}/brackets/${code}`;
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Load failed (${response.status})`);
  }
  return response.json();
};
