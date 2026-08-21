// Load .env with override=true so that the .env file's DATABASE_URL
// takes precedence over any system env (e.g., container defaults).
// This MUST happen before PrismaClient is instantiated.
import { config } from 'dotenv';
config({ path: '.env', override: true });

// Belt-and-suspenders: explicitly read .env and override process.env
// in case dotenv's override doesn't fully work in some environments.
import * as fs from 'fs';
import * as path from 'path';

try {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      // Strip surrounding quotes (single or double)
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && value) {
        process.env[key] = value;
      }
    }
  }
} catch {
  // Silent fail — don't break the app
}

// CRITICAL: If DATABASE_URL is still a SQLite path (from system env),
// override it with the correct PostgreSQL connection string.
// This happens on hosting platforms where a stale system env var
// overrides the .env file. On Vercel, env vars should be set in the
// Vercel dashboard — this is a fallback for when they're not.
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith('file:')) {
  process.env.DATABASE_URL = 'postgresql://neondb_owner:npg_cFAN93LwhkXs@ep-falling-firefly-ayrc50s1-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
  process.env.DIRECT_URL = 'postgresql://neondb_owner:npg_cFAN93LwhkXs@ep-falling-firefly-ayrc50s1-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
}
if (!process.env.NEXTAUTH_SECRET) {
  process.env.NEXTAUTH_SECRET = 'zqqhTeS/R+g5OmG8regKXehsFjL9JmIhHIb/j8dIrxo=';
}

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
};

// Only log queries in development — too noisy/slow for production
const logConfig = process.env.NODE_ENV === 'production' ? [] : ['query'];

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: logConfig as any,
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
