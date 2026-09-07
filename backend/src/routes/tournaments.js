const express = require("express");
const { query, withTransaction } = require("../db");
const { requireAuth, optionalAuth } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

router.get(
  "/",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const result = await query(`
      SELECT t.*, g.name AS game_name, g.slug AS game_slug,
        (SELECT COUNT(*) FROM tournament_entries e WHERE e.tournament_id = t.id) AS entry_count
      FROM tournaments t JOIN games g ON g.id = t.game_id
      WHERE t.status = 'open'
      ORDER BY t.created_at DESC
    `);
    res.json({ tournaments: result.rows.map(publicTournament) });
  })
);

router.post(
  "/:id/enter",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tResult = await query("SELECT * FROM tournaments WHERE id = $1", [req.params.id]);
    const tournament = tResult.rows[0];
    if (!tournament) return res.status(404).json({ error: "Tournament not found." });
    if (tournament.status !== "open") return res.status(409).json({ error: "Entries are closed." });

    const already = await query(
      "SELECT id FROM tournament_entries WHERE tournament_id = $1 AND user_id = $2",
      [tournament.id, req.userId]
    );
    if (already.rows.length) return res.status(409).json({ error: "You're already entered." });

    const userResult = await query("SELECT balance_cents FROM users WHERE id = $1", [req.userId]);
    const user = userResult.rows[0];
    if (tournament.entry_cents > 0 && user.balance_cents < tournament.entry_cents) {
      return res.status(402).json({ error: "Insufficient balance for this entry fee." });
    }

    await withTransaction(async (client) => {
      if (tournament.entry_cents > 0) {
        await client.query("UPDATE users SET balance_cents = balance_cents - $1 WHERE id = $2", [
          tournament.entry_cents,
          req.userId,
        ]);
        await client.query(
          "INSERT INTO wallet_transactions (user_id, amount_cents, type, reference) VALUES ($1, $2, 'entry_fee', $3)",
          [req.userId, -tournament.entry_cents, `tournament:${tournament.id}`]
        );
      }
      await client.query("INSERT INTO tournament_entries (tournament_id, user_id) VALUES ($1, $2)", [
        tournament.id,
        req.userId,
      ]);
    });

    res.status(201).json({ ok: true });
  })
);

function publicTournament(row) {
  return {
    id: row.id,
    game: { name: row.game_name, slug: row.game_slug },
    title: row.title,
    format: row.format,
    tier: row.tier,
    prizeCents: row.prize_cents,
    entryCents: row.entry_cents,
    isFree: row.entry_cents === 0,
    status: row.status,
    entryCount: Number(row.entry_count),
    createdAt: row.created_at,
  };
}

module.exports = router;
