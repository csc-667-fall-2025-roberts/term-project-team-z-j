// src/backend/database.ts
import dotenv from 'dotenv';
import { Pool } from 'pg';

// load environment variables from .env file
dotenv.config();

// Create a shared connection pool using either DATABASE_URL or individual values
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Fallback in case DATABASE_URL isn't set for some machines
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  database: process.env.DB_NAME,
});

// Simple helper function to run queries
export async function query<T = any>(text: string, params?: any[]): Promise<{ rows: T[] }> {
  // In class, we usually just return pool.query(...)
  return pool.query(text, params);
}

// Optional: quick self-test on startup (used by server.ts)
export async function testConnection(): Promise<void> {
  try {
    await pool.query('SELECT 1');
    console.log('[db] Connected to PostgreSQL');
  } catch (err) {
    console.error('[db] Failed to connect to PostgreSQL:', err);
    throw err;
  }
}

export default pool;
