const express = require("express");
const { z } = require("zod");
const { query, withTransaction } = require("../db");
const { requireAuth, optionalAuth } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

router.get(
  "/",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { game } = req.query;
    const result = game
      ? await query(
          `SELECT m.*, g.name AS game_name, g.slug AS game_slug
           FROM matchups m JOIN games g ON g.id = m.game_id
           WHERE m.status = 'open' AND g.slug = $1
           ORDER BY m.created_at DESC`,
          [game]
        )
      : await query(
          `SELECT m.*, g.name AS game_name, g.slug AS game_slug
           FROM matchups m JOIN games g ON g.id = m.game_id
           WHERE m.status = 'open'
           ORDER BY m.created_at DESC`
        );
    res.json({ matchups: result.rows.map(publicMatchup) });
  })
);

const createSchema = z.object({
  gameSlug: z.string(),
  format: z.string().min(1),
  title: z.string().min(1).max(140),
  prizeCents: z.number().int().positive(),
  entryCents: z.number().int().nonnegative(),
});

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid matchup details." });
    const { gameSlug, format, title, prizeCents, entryCents } = parsed.data;

    const gameResult = await query("SELECT id FROM games WHERE slug = $1", [gameSlug]);
    const game = gameResult.rows[0];
    if (!game) return res.status(404).json({ error: "Unknown game." });

    const userResult = await query("SELECT balance_cents FROM users WHERE id = $1", [req.userId]);
    const user = userResult.rows[0];
    if (entryCents > 0 && user.balance_cents < entryCents) {
      return res.status(402).json({ error: "Insufficient balance to post this entry fee." });
    }

    const matchupId = await withTransaction(async (client) => {
      if (entryCents > 0) {
        await debitUser(client, req.userId, entryCents, "entry_fee", null);
      }
      const inserted = await client.query(
        `INSERT INTO matchups (game_id, creator_id, format, title, prize_cents, entry_cents, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'open')
         RETURNING id`,
        [game.id, req.userId, format, title, prizeCents, entryCents]
      );
      return inserted.rows[0].id;
    });

    res.status(201).json({ matchup: await getMatchupById(matchupId) });
  })
);

router.post(
  "/:id/challenge",
  requireAuth,
  asyncHandler(async (req, res) => {
    const matchup = await getMatchupById(req.params.id);
    if (!matchup) return res.status(404).json({ error: "Matchup not found." });
    if (matchup.status !== "open") return res.status(409).json({ error: "This matchup is no longer open." });
    if (matchup.creatorId === req.userId) {
      return res.status(400).json({ error: "You can't challenge your own matchup." });
    }

    const userResult = await query("SELECT balance_cents FROM users WHERE id = $1", [req.userId]);
    const user = userResult.rows[0];
    if (matchup.entryCents > 0 && user.balance_cents < matchup.entryCents) {
      return res.status(402).json({ error: "Insufficient balance to accept this entry fee." });
    }

    await withTransaction(async (client) => {
      if (matchup.entryCents > 0) {
        await debitUser(client, req.userId, matchup.entryCents, "entry_fee", `matchup:${matchup.id}`);
      }
      await client.query(
        "UPDATE matchups SET opponent_id = $1, status = 'in_progress' WHERE id = $2",
        [req.userId, matchup.id]
      );
    });

    res.json({ matchup: await getMatchupById(matchup.id) });
  })
);

const resultSchema = z.object({ winnerId: z.number().int() });

// Both the creator and the opponent should call this with the same
// winnerId; a real implementation would require both submissions to
// match before paying out, and route to a dispute flow if they don't.
// This simplified version pays out on the first submission — replace
// with a two-sided confirmation before handling real money.
router.post(
  "/:id/report",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = resultSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "winnerId is required." });

    const matchup = await getMatchupById(req.params.id);
    if (!matchup) return res.status(404).json({ error: "Matchup not found." });
    if (matchup.status !== "in_progress") {
      return res.status(409).json({ error: "This matchup isn't awaiting a result." });
    }
    const participants = [matchup.creatorId, matchup.opponentId];
    if (!participants.includes(req.userId)) {
      return res.status(403).json({ error: "Only match participants can report a result." });
    }
    if (!participants.includes(parsed.data.winnerId)) {
      return res.status(400).json({ error: "winnerId must be one of the two participants." });
    }

    await withTransaction(async (client) => {
      await creditUser(client, parsed.data.winnerId, matchup.prizeCents, "prize_payout", `matchup:${matchup.id}`);
      await client.query("INSERT INTO xp_ledger (user_id, xp, reason) VALUES ($1, $2, $3)", [
        parsed.data.winnerId,
        Math.max(10, Math.round(matchup.prizeCents / 100)),
        `matchup:${matchup.id}`,
      ]);
      await client.query("UPDATE matchups SET status = 'completed', winner_id = $1 WHERE id = $2", [
        parsed.data.winnerId,
        matchup.id,
      ]);
    });

    res.json({ matchup: await getMatchupById(matchup.id) });
  })
);

async function getMatchupById(id) {
  const result = await query(
    `SELECT m.*, g.name AS game_name, g.slug AS game_slug
     FROM matchups m JOIN games g ON g.id = m.game_id
     WHERE m.id = $1`,
    [id]
  );
  return result.rows[0] ? publicMatchup(result.rows[0]) : null;
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

// Shared wallet helpers (also used by tournaments.js). MUST be called with
// a transaction client so the balance update and ledger row commit/rollback
// together with the rest of the operation.
async function debitUser(client, userId, amountCents, type, reference) {
  await client.query("UPDATE users SET balance_cents = balance_cents - $1 WHERE id = $2", [amountCents, userId]);
  await client.query(
    "INSERT INTO wallet_transactions (user_id, amount_cents, type, reference) VALUES ($1, $2, $3, $4)",
    [userId, -amountCents, type, reference]
  );
}

async function creditUser(client, userId, amountCents, type, reference) {
  await client.query("UPDATE users SET balance_cents = balance_cents + $1 WHERE id = $2", [amountCents, userId]);
  await client.query(
    "INSERT INTO wallet_transactions (user_id, amount_cents, type, reference) VALUES ($1, $2, $3, $4)",
    [userId, amountCents, type, reference]
  );
}

module.exports = router;
module.exports.debitUser = debitUser;
module.exports.creditUser = creditUser;
