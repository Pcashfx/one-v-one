const { pool, query, initSchema } = require("./index");

async function seed() {
  await initSchema();

  const games = [
    ["Black Ops 7", "black-ops-7", "Cross-platform"],
    ["Valorant", "valorant", "PC"],
    ["Rocket League", "rocket-league", "Cross-platform"],
    ["FC 26", "fc-26", "Cross-platform"],
    ["Apex Legends", "apex-legends", "Cross-platform"],
  ];
  for (const [name, slug, platform] of games) {
    await query(
      "INSERT INTO games (name, slug, platform) VALUES ($1, $2, $3) ON CONFLICT (slug) DO NOTHING",
      [name, slug, platform]
    );
  }

  const gameRows = (await query("SELECT id, slug FROM games")).rows;
  const gameIdBySlug = Object.fromEntries(gameRows.map((g) => [g.slug, g.id]));

  // Placeholder "system" user (id referenced as creator for seed matchups).
  const userCount = (await query("SELECT COUNT(*) AS n FROM users")).rows[0].n;
  let systemUserId;
  if (Number(userCount) === 0) {
    const result = await query(
      `INSERT INTO users (username, email, password_hash, balance_cents, age_confirmed, terms_accepted)
       VALUES ('system', 'system@onevone.example', 'not-a-real-hash', 0, true, true)
       RETURNING id`
    );
    systemUserId = result.rows[0].id;
  } else {
    const existing = await query("SELECT id FROM users WHERE username = 'system'");
    systemUserId = existing.rows[0] ? existing.rows[0].id : null;
  }

  // Only seed sample matchups/tournaments once, so re-running this on every
  // Render deploy doesn't pile up duplicates.
  const matchupCount = (await query("SELECT COUNT(*) AS n FROM matchups")).rows[0].n;
  if (Number(matchupCount) === 0 && systemUserId) {
    const sampleMatchups = [
      { slug: "black-ops-7", format: "3v3 · Bo3", title: "Search & Destroy, no respawns, gold guns banned", prize_cents: 18000, entry_cents: 1000 },
      { slug: "valorant", format: "1v1 · Bo5", title: "Aim duel, pistols only, first to 13", prize_cents: 6000, entry_cents: 300 },
      { slug: "rocket-league", format: "2v2 · Bo3", title: "Standard rules, no boost cap, ranked lobby", prize_cents: 9500, entry_cents: 500 },
      { slug: "fc-26", format: "1v1 · Bo1", title: "6 minute halves, no custom tactics", prize_cents: 4000, entry_cents: 200 },
      { slug: "apex-legends", format: "3v3 · Bo1", title: "Kings Canyon, no third-partying, first to 3 wins", prize_cents: 13500, entry_cents: 800 },
    ];
    for (const m of sampleMatchups) {
      await query(
        `INSERT INTO matchups (game_id, creator_id, format, title, prize_cents, entry_cents, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'open')`,
        [gameIdBySlug[m.slug], systemUserId, m.format, m.title, m.prize_cents, m.entry_cents]
      );
    }
  }

  const tournamentCount = (await query("SELECT COUNT(*) AS n FROM tournaments")).rows[0].n;
  if (Number(tournamentCount) === 0) {
    const sampleTournaments = [
      { slug: "black-ops-7", title: "$75 GTD — Amateur/Expert, No Respawns, Switcharoo", format: "3v3 · Bo3", tier: "expert", prize_cents: 7500, entry_cents: 100 },
      { slug: "black-ops-7", title: "$150 GTD — All Skills, No Golds, Search & Destroy", format: "3v3 · Bo3", tier: "amateur", prize_cents: 15000, entry_cents: 1000 },
      { slug: "black-ops-7", title: "$90 GTD — Free Entry, All Skills, Search & Destroy", format: "3v3 · Bo1", tier: "novice", prize_cents: 9000, entry_cents: 0 },
      { slug: "valorant", title: "$400 GTD — Expert Only, Standard Competitive Ruleset", format: "5v5 · Bo3", tier: "expert", prize_cents: 40000, entry_cents: 2000 },
      { slug: "rocket-league", title: "$180 GTD — All Skills, Standard Rules", format: "2v2 · Bo3", tier: "amateur", prize_cents: 18000, entry_cents: 500 },
    ];
    for (const t of sampleTournaments) {
      await query(
        `INSERT INTO tournaments (game_id, title, format, tier, prize_cents, entry_cents, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'open')`,
        [gameIdBySlug[t.slug], t.title, t.format, t.tier, t.prize_cents, t.entry_cents]
      );
    }
  }

  console.log("Seed complete: schema ensured, games ensured, sample data inserted if the tables were empty.");
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
