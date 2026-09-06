const express = require("express");
const { db } = require("../db");

const router = express.Router();

// Weekly XP leaderboard. In this simplified schema, "weekly" just sums the
// xp_ledger table — swap in a real date filter (e.g. WHERE created_at >=
// start of week) once matches are actually being played and logged.
router.get("/", (req, res) => {
  const rows = db
    .prepare(`
      SELECT u.id, u.username, COALESCE(SUM(x.xp), 0) AS total_xp
      FROM users u
      LEFT JOIN xp_ledger x ON x.user_id = u.id
      WHERE u.username != 'system'
      GROUP BY u.id
      ORDER BY total_xp DESC
      LIMIT 50
    `)
    .all();

  res.json({
    leaderboard: rows.map((row, i) => ({
      rank: i + 1,
      userId: row.id,
      username: row.username,
      xp: row.total_xp,
    })),
  });
});

module.exports = router;
