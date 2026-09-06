const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
require("dotenv").config();

const dbPath = process.env.DATABASE_PATH || "./data/onevone.db";
const resolvedPath = path.resolve(process.cwd(), dbPath);

fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

const db = new Database(resolvedPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function initSchema() {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  db.exec(schema);
}

module.exports = { db, initSchema };
