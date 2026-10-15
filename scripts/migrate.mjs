// Applies db/migrations/*.sql in order over the direct (unpooled) connection,
// then prints the browser connection string for the restricted `cleaning_app` role.
// Usage: node --env-file=.env scripts/migrate.mjs
import { readdir, readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED });
const client = await pool.connect();
try {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const applied = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  for (const name of (await readdir('db/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    if (applied.has(name)) continue;
    await client.query('BEGIN');
    await client.query(await readFile(`db/migrations/${name}`, 'utf8'));
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    await client.query('COMMIT');
    console.log(`applied ${name}`);
  }

  if (process.argv.includes('--rotate-app-password')) {
    const password = randomBytes(24).toString('base64url');
    await client.query(`ALTER ROLE cleaning_app PASSWORD '${password}'`);
    const url = new URL(process.env.DATABASE_URL);
    url.username = 'cleaning_app';
    url.password = password;
    console.log(`APP_DATABASE_URL=${url}`);
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  throw err;
} finally {
  client.release();
  await pool.end();
}
