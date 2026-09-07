-- One V One database schema (PostgreSQL)

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  age_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  terms_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  identity_verified BOOLEAN NOT NULL DEFAULT FALSE,
  identity_verification_session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS games (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matchups (
  id SERIAL PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES games(id),
  creator_id INTEGER NOT NULL REFERENCES users(id),
  opponent_id INTEGER REFERENCES users(id),
  format TEXT NOT NULL,
  title TEXT NOT NULL,
  prize_cents INTEGER NOT NULL,
  entry_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  winner_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tournaments (
  id SERIAL PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES games(id),
  title TEXT NOT NULL,
  format TEXT NOT NULL,
  tier TEXT NOT NULL,
  prize_cents INTEGER NOT NULL,
  entry_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tournament_entries (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tournament_id, user_id)
);

CREATE TABLE IF NOT EXISTS xp_ledger (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  xp INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL,
  type TEXT NOT NULL,
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matchups_status ON matchups(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_wallet_user ON wallet_transactions(user_id);

-- Migration: adds identity verification columns to a users table that may
-- already exist from before this feature was added (CREATE TABLE IF NOT
-- EXISTS above won't add columns to an existing table, so this covers it).
ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_verification_session_id TEXT;
