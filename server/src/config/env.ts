import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env from the server root (only in local dev, not Vercel)
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
} catch {
  // In Vercel serverless or other environments, just use process.env directly
}

interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY: string;
  FRONTEND_URL: string;
  DATABASE_URL: string | undefined;
}

function getEnvVar(key: string, fallback?: string): string {
  const value = (process.env[key] ?? fallback)?.trim();
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getOptionalEnvVar(key: string): string | undefined {
  return process.env[key]?.trim();
}

export const env: EnvConfig = {
  PORT: parseInt(getEnvVar('PORT', '5000'), 10),
  NODE_ENV: getEnvVar('NODE_ENV', 'development'),
  SUPABASE_URL: getEnvVar('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: getEnvVar('SUPABASE_SERVICE_ROLE_KEY'),
  SUPABASE_ANON_KEY: getEnvVar('SUPABASE_ANON_KEY'),
  FRONTEND_URL: getEnvVar('FRONTEND_URL', 'http://localhost:5173'),
  DATABASE_URL: getOptionalEnvVar('DATABASE_URL'),
};
