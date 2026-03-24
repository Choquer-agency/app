import { readFileSync } from 'fs';
import { createPool } from '@vercel/postgres';

const url = process.env.POSTGRES_URL;
if (!url) {
  console.error('POSTGRES_URL not set');
  process.exit(1);
}

const file = process.argv[2];
if (!file) {
  console.error('Usage: node db/run-migration.mjs <migration-file.sql>');
  process.exit(1);
}

const sqlContent = readFileSync(file, 'utf-8');
const pool = createPool({ connectionString: url });

try {
  await pool.query(sqlContent);
  console.log(`Migration applied: ${file}`);
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
