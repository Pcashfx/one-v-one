-- One V One database schema (SQLite)

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  age_confirmed INTEGER NOT NULL DEFAULT 0,
  terms_accepted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matchups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id),
  creator_id INTEGER NOT NULL REFERENCES users(id),
  opponent_id INTEGER REFERENCES users(id),
  format TEXT NOT NULL,          -- e.g. "1v1 · Bo3"
  title TEXT NOT NULL,           -- rules summary
  prize_cents INTEGER NOT NULL,
  entry_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',   -- open | in_progress | disputed | completed | cancelled
  winner_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id),
  title TEXT NOT NULL,
  format TEXT NOT NULL,
  tier TEXT NOT NULL,            -- novice | amateur | expert | all
  prize_cents INTEGER NOT NULL,
  entry_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',   -- open | in_progress | completed | cancelled
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tournament_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tournament_id, user_id)
);

CREATE TABLE IF NOT EXISTS xp_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  xp INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every balance change is recorded here so a user's balance can always be
-- reconstructed/audited, not just trusted from users.balance_cents.
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL,     -- positive = credit, negative = debit
  type TEXT NOT NULL,                -- deposit | withdrawal | entry_fee | prize_payout | adjustment
  reference TEXT,                    -- e.g. matchup:12, tournament:4
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_matchups_status ON matchups(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_wallet_user ON wallet_transactions(user_id);
