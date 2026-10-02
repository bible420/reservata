const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;
const ENABLED = Boolean(DATABASE_URL);

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: DATABASE_URL });
  }
  return pool;
}

async function ensureSchema() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function load(key) {
  const { rows } = await getPool().query("SELECT value FROM app_state WHERE key = $1", [key]);
  return rows.length ? rows[0].value : null;
}

async function save(key, value) {
  await getPool().query(
    `INSERT INTO app_state (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)]
  );
}

// Push a row to Postgres without blocking the request. Errors are logged, not thrown,
// so the JSON file cache keeps the app functional if the database is unreachable.
function saveInBackground(key, value) {
  if (!ENABLED) return;
  save(key, value).catch((error) => console.error(`Failed to sync "${key}" to Postgres:`, error.message));
}

async function syncFromPostgres(keys) {
  if (!ENABLED) return {};
  await ensureSchema();
  const result = {};
  for (const key of keys) {
    const value = await load(key);
    if (value) result[key] = value;
  }
  return result;
}

module.exports = { ENABLED, DATABASE_URL, ensureSchema, load, save, saveInBackground, syncFromPostgres };
