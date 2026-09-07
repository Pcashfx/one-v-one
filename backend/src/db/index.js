const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.warn(
    "WARNING: DATABASE_URL is not set. Add a Postgres connection string to your .env (or Render environment variables) before starting the server."
  );
}

// Render's managed Postgres requires SSL for external connections but not
// for the internal connection string used service-to-service; disabling
// certificate verification is Render's own documented approach since they
// use an internal CA. Local Postgres (no "render.com" in the URL) skips SSL.
const pool = new Pool({
  connectionString,
  ssl:
    connectionString && !connectionString.includes("localhost")
      ? { rejectUnauthorized: false }
      : false,
});

function query(text, params) {
  return pool.query(text, params);
}

// Runs a set of queries inside a single transaction. `fn` receives a
// dedicated client — use client.query(...) inside it, not the pool-level
// query() helper, or the statements won't share the transaction.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function initSchema() {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(schema);
}

module.exports = { pool, query, withTransaction, initSchema };
