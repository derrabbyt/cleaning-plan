// Writes the browser DB connection string into a generated (gitignored) module at build time.
// Locally it comes from .env; on GitHub Actions from the APP_DATABASE_URL repository secret.
// NOTE: the value ends up in the public JS bundle — it must be the restricted `cleaning_app` role.
import { writeFileSync } from 'node:fs';

const url = process.env.APP_DATABASE_URL;
if (!url) throw new Error('APP_DATABASE_URL is not set');
if (new URL(url).username !== 'cleaning_app') throw new Error('APP_DATABASE_URL must use the cleaning_app role');
writeFileSync('src/app/db-config.generated.ts', `export const DATABASE_URL = ${JSON.stringify(url)};\n`);
