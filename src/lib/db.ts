// Load .env with override=true so that the .env file's DATABASE_URL
// takes precedence over any system env (e.g., container defaults).
// This MUST happen before PrismaClient is instantiated.
import { config } from 'dotenv';
config({ path: '.env', override: true });

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