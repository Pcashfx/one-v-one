const express = require("express");
const { db } = require("../db");
const { requireAuth, optionalAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", optionalAuth, (req, res) => {
  const rows = db
    .prepare(`
      SELECT t.*, g.name AS game_name, g.slug AS game_slug,
        (SELECT COUNT(*) FROM tournament_entries e WHERE e.tournament_id = t.id) AS entry_count
      FROM tournaments t JOIN games g ON g.id = t.game_id
      WHERE t.status = 'open'
      ORDER BY t.created_at DESC
    `)
    .all();
  res.json({ tournaments: rows.map(publicTournament) });
});

router.post("/:id/enter", requireAuth, (req, res) => {
  const tournament = db.prepare("SELECT * FROM tournaments WHERE id = ?").get(req.params.id);
  if (!tournament) return res.status(404).json({ error: "Tournament not found." });
  if (tournament.status !== "open") return res.status(409).json({ error: "Entries are closed." });

  const already = db
    .prepare("SELECT id FROM tournament_entries WHERE tournament_id = ? AND user_id = ?")
    .get(tournament.id, req.userId);
  if (already) return res.status(409).json({ error: "You're already entered." });

  const user = db.prepare("SELECT balance_cents FROM users WHERE id = ?").get(req.userId);
  if (tournament.entry_cents > 0 && user.balance_cents < tournament.entry_cents) {
    return res.status(402).json({ error: "Insufficient balance for this entry fee." });
  }

  const enterTx = db.transaction(() => {
    if (tournament.entry_cents > 0) {
      db.prepare("UPDATE users SET balance_cents = balance_cents - ? WHERE id = ?").run(
        tournament.entry_cents,
        req.userId
      );
      db.prepare(
        "INSERT INTO wallet_transactions (user_id, amount_cents, type, reference) VALUES (?, ?, 'entry_fee', ?)"
      ).run(req.userId, -tournament.entry_cents, `tournament:${tournament.id}`);
    }
    db.prepare(
      "INSERT INTO tournament_entries (tournament_id, user_id) VALUES (?, ?)"
    ).run(tournament.id, req.userId);
  });
  enterTx();

  res.status(201).json({ ok: true });
});

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
    entryCount: row.entry_count,
    createdAt: row.created_at,
  };
}

module.exports = router;
