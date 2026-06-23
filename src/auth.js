import { readFileSync as fsRead } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';

// Accepts inline JSON (CI secret) or a path to the key file (local). Injected
// reader for testability.
export function resolveCredentials(value, deps = {}) {
  const readFileSync = deps.readFileSync || fsRead;
  if (!value || !value.trim()) throw new Error('GOOGLE_SHEETS_SA_JSON is not set');
  const raw = value.trim().startsWith('{') ? value : readFileSync(value, 'utf8');
  return JSON.parse(raw);
}

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

export async function getAccessToken(saValue) {
  const credentials = resolveCredentials(saValue);
  const auth = new GoogleAuth({ credentials, scopes: SCOPES });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('failed to obtain access token');
  return token;
}
