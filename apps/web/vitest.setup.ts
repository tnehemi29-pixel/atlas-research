import { readFileSync } from 'node:fs';
import path from 'node:path';

// Vitest doesn't get Next.js's automatic .env loading, and pulling in the
// `dotenv` package just for this is unnecessary — a handful of KEY="value"
// lines is all apps/web/.env ever holds.
function loadEnvFile(filePath: string): void {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return; // .env is optional — CI can set real env vars directly instead.
  }

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);

    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(__dirname, '.env'));
