const express = require("express");
const { z } = require("zod");
const { db } = require("../db");
const { requireAuth, optionalAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", optionalAuth, (req, res) => {
  const { game } = req.query;
  let rows;
  if (game) {
    rows = db
      .prepare(`
        SELECT m.*, g.name AS game_name, g.slug AS game_slug
        FROM matchups m JOIN games g ON g.id = m.game_id
        WHERE m.status = 'open' AND g.slug = ?
        ORDER BY m.created_at DESC
      `)
      .all(game);
  } else {
    rows = db
      .prepare(`
        SELECT m.*, g.name AS game_name, g.slug AS game_slug
        FROM matchups m JOIN games g ON g.id = m.game_id
        WHERE m.status = 'open'
        ORDER BY m.created_at DESC
      `)
      .all();
  }
  res.json({ matchups: rows.map(publicMatchup) });
});

const createSchema = z.object({
  gameSlug: z.string(),
  format: z.string().min(1),
  title: z.string().min(1).max(140),
  prizeCents: z.number().int().positive(),
  entryCents: z.number().int().nonnegative(),
});

router.post("/", requireAuth, (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid matchup details." });
  }
  const { gameSlug, format, title, prizeCents, entryCents } = parsed.data;

  const game = db.prepare("SELECT id FROM games WHERE slug = ?").get(gameSlug);
  if (!game) return res.status(404).json({ error: "Unknown game." });

  const user = db.prepare("SELECT balance_cents FROM users WHERE id = ?").get(req.userId);
  if (entryCents > 0 && user.balance_cents < entryCents) {
    return res.status(402).json({ error: "Insufficient balance to post this entry fee." });
  }

  const insertMatchup = db.transaction(() => {
    if (entryCents > 0) {
      debitUser(req.userId, entryCents, "entry_fee", null);
    }
    const result = db
      .prepare(`
        INSERT INTO matchups (game_id, creator_id, format, title, prize_cents, entry_cents, status)
        VALUES (?, ?, ?, ?, ?, ?, 'open')
      `)
      .run(game.id, req.userId, format, title, prizeCents, entryCents);
    return result.lastInsertRowid;
  });

  const id = insertMatchup();
  res.status(201).json({ matchup: getMatchupById(id) });
});

router.post("/:id/challenge", requireAuth, (req, res) => {
  const matchup = getMatchupById(req.params.id);
  if (!matchup) return res.status(404).json({ error: "Matchup not found." });
  if (matchup.status !== "open") return res.status(409).json({ error: "This matchup is no longer open." });
  if (matchup.creator_id === req.userId) {
    return res.status(400).json({ error: "You can't challenge your own matchup." });
  }

  const user = db.prepare("SELECT balance_cents FROM users WHERE id = ?").get(req.userId);
  if (matchup.entry_cents > 0 && user.balance_cents < matchup.entry_cents) {
    return res.status(402).json({ error: "Insufficient balance to accept this entry fee." });
  }

  const acceptTx = db.transaction(() => {
    if (matchup.entry_cents > 0) {
      debitUser(req.userId, matchup.entry_cents, "entry_fee", `matchup:${matchup.id}`);
    }
    db.prepare("UPDATE matchups SET opponent_id = ?, status = 'in_progress' WHERE id = ?").run(
      req.userId,
      matchup.id
    );
  });
  acceptTx();

  res.json({ matchup: getMatchupById(matchup.id) });
});

const resultSchema = z.object({ winnerId: z.number().int() });

// Both the creator and the opponent should call this with the same
// winnerId; a real implementation would require both submissions to
// match before paying out, and route to a dispute flow if they don't.
// This simplified version pays out on the first submission — replace
// with a two-sided confirmation before handling real money.
router.post("/:id/report", requireAuth, (req, res) => {
  const parsed = resultSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "winnerId is required." });

  const matchup = getMatchupById(req.params.id);
  if (!matchup) return res.status(404).json({ error: "Matchup not found." });
  if (matchup.status !== "in_progress") {
    return res.status(409).json({ error: "This matchup isn't awaiting a result." });
  }
  const participants = [matchup.creator_id, matchup.opponent_id];
  if (!participants.includes(req.userId)) {
    return res.status(403).json({ error: "Only match participants can report a result." });
  }
  if (!participants.includes(parsed.data.winnerId)) {
    return res.status(400).json({ error: "winnerId must be one of the two participants." });
  }

  const payoutTx = db.transaction(() => {
    creditUser(parsed.data.winnerId, matchup.prize_cents, "prize_payout", `matchup:${matchup.id}`);
    db.prepare("INSERT INTO xp_ledger (user_id, xp, reason) VALUES (?, ?, ?)").run(
      parsed.data.winnerId,
      Math.max(10, Math.round(matchup.prize_cents / 100)),
      `matchup:${matchup.id}`
    );
    db.prepare("UPDATE matchups SET status = 'completed', winner_id = ? WHERE id = ?").run(
      parsed.data.winnerId,
      matchup.id
    );
  });
  payoutTx();

  res.json({ matchup: getMatchupById(matchup.id) });
});

function getMatchupById(id) {
  const row = db
    .prepare(`
      SELECT m.*, g.name AS game_name, g.slug AS game_slug
      FROM matchups m JOIN games g ON g.id = m.game_id
      WHERE m.id = ?
    `)
    .get(id);
  return row ? publicMatchup(row) : null;
}

function publicMatchup(row) {
  return {
    id: row.id,
    game: { name: row.game_name, slug: row.game_slug },
    creatorId: row.creator_id,
    opponentId: row.opponent_id,
    format: row.format,
    title: row.title,
    prizeCents: row.prize_cents,
    entryCents: row.entry_cents,
    status: row.status,
    winnerId: row.winner_id,
    createdAt: row.created_at,
  };
}

// Shared wallet helpers (also used by tournaments.js) --------------------
function debitUser(userId, amountCents, type, reference) {
  db.prepare("UPDATE users SET balance_cents = balance_cents - ? WHERE id = ?").run(amountCents, userId);
  db.prepare(
    "INSERT INTO wallet_transactions (user_id, amount_cents, type, reference) VALUES (?, ?, ?, ?)"
  ).run(userId, -amountCents, type, reference);
}

function creditUser(userId, amountCents, type, reference) {
  db.prepare("UPDATE users SET balance_cents = balance_cents + ? WHERE id = ?").run(amountCents, userId);
  db.prepare(
    "INSERT INTO wallet_transactions (user_id, amount_cents, type, reference) VALUES (?, ?, ?, ?)"
  ).run(userId, amountCents, type, reference);
}

module.exports = router;
module.exports.debitUser = debitUser;
module.exports.creditUser = creditUser;
