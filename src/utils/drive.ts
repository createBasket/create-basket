const CLIENT_ID = import.meta.env.VITE_GDRIVE_CLIENT_ID as string | undefined;
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TOKEN_KEY = 'drive-token';
const FILE_ID_KEY = 'drive-file-id';

declare global {
  interface Window {
    google?: any;
  }
}

const loadGisScript = () =>
  new Promise<void>((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });

const getStoredToken = () => {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as { token: string; expiresAt: number };
  if (Date.now() > parsed.expiresAt) return null;
  return parsed.token;
};

const storeToken = (token: string, expiresIn: number) => {
  localStorage.setItem(
    TOKEN_KEY,
    JSON.stringify({ token, expiresAt: Date.now() + expiresIn * 1000 - 60 * 1000 })
  );
};

const ensureToken = async (): Promise<string> => {
  if (!CLIENT_ID) throw new Error('Missing VITE_GDRIVE_CLIENT_ID');
  const existing = getStoredToken();
  if (existing) return existing;

  await loadGisScript();
  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (response: any) => {
        if (response.error) {
          reject(response);
          return;
        }
        storeToken(response.access_token, response.expires_in);
        resolve(response.access_token);
      }
    });
    tokenClient.requestAccessToken();
  });
};

const getFileId = () => localStorage.getItem(FILE_ID_KEY);
const setFileId = (id: string) => localStorage.setItem(FILE_ID_KEY, id);

export const saveToDrive = async (content: object, name = 'bracket-save.json') => {
  const token = await ensureToken();
  const existingId = getFileId();
  const boundary = '-------314159265358979323846';
  const metadata = {
    name,
    mimeType: 'application/json'
  };
  const body = JSON.stringify(content, null, 2);
  const multipartRequestBody =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    'Content-Type: application/json\r\n\r\n' +
    body +
    `\r\n--${boundary}--`;

  const method = existingId ? 'PATCH' : 'POST';
  const url = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: multipartRequestBody
  });

  if (!res.ok) {
    throw new Error(`Drive save failed (${res.status})`);
  }
  const data = (await res.json()) as { id: string };
  setFileId(data.id);
  return data.id;
};

export const loadFromDrive = async () => {
  const token = await ensureToken();
  const fileId = getFileId();
  if (!fileId) throw new Error('No Drive file saved yet.');
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    throw new Error(`Drive load failed (${res.status})`);
  }
  return res.json();
};
