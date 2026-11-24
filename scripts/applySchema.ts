import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';

async function applySchema(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const schema = await readFile(resolve(process.cwd(), 'database/schema.sql'), 'utf8');
  const database = new Pool({ connectionString: databaseUrl });

  try {
    await database.query(schema);
    console.log('Database schema applied successfully.');
  } finally {
    await database.end();
  }
}

applySchema().catch((error: unknown) => {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : 'unknown error';
  console.error(`Could not apply database schema (${code}).`);
  process.exitCode = 1;
});