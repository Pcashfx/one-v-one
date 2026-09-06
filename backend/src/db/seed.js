const { db, initSchema } = require("./index");

initSchema();

const games = [
  ["Black Ops 7", "black-ops-7", "Cross-platform"],
  ["Valorant", "valorant", "PC"],
  ["Rocket League", "rocket-league", "Cross-platform"],
  ["FC 26", "fc-26", "Cross-platform"],
  ["Apex Legends", "apex-legends", "Cross-platform"],
];

const insertGame = db.prepare(
  "INSERT OR IGNORE INTO games (name, slug, platform) VALUES (?, ?, ?)"
);
const gameTx = db.transaction((rows) => {
  rows.forEach((row) => insertGame.run(...row));
});
gameTx(games);

const gameIdBySlug = Object.fromEntries(
  db.prepare("SELECT id, slug FROM games").all().map((g) => [g.slug, g.id])
);

const insertMatchup = db.prepare(`
  INSERT INTO matchups (game_id, creator_id, format, title, prize_cents, entry_cents, status)
  VALUES (@game_id, 1, @format, @title, @prize_cents, @entry_cents, 'open')
`);

const sampleMatchups = [
  { slug: "black-ops-7", format: "3v3 · Bo3", title: "Search & Destroy, no respawns, gold guns banned", prize_cents: 18000, entry_cents: 1000 },
  { slug: "valorant", format: "1v1 · Bo5", title: "Aim duel, pistols only, first to 13", prize_cents: 6000, entry_cents: 300 },
  { slug: "rocket-league", format: "2v2 · Bo3", title: "Standard rules, no boost cap, ranked lobby", prize_cents: 9500, entry_cents: 500 },
  { slug: "fc-26", format: "1v1 · Bo1", title: "6 minute halves, no custom tactics", prize_cents: 4000, entry_cents: 200 },
  { slug: "apex-legends", format: "3v3 · Bo1", title: "Kings Canyon, no third-partying, first to 3 wins", prize_cents: 13500, entry_cents: 800 },
];

// Need a placeholder "system" user (id 1) to own seed matchups if no users exist yet.
const userCount = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
if (userCount === 0) {
  db.prepare(`
    INSERT INTO users (username, email, password_hash, balance_cents, age_confirmed, terms_accepted)
    VALUES ('system', 'system@onevone.example', 'not-a-real-hash', 0, 1, 1)
  `).run();
}

const matchupTx = db.transaction((rows) => {
  rows.forEach((row) =>
    insertMatchup.run({
      game_id: gameIdBySlug[row.slug],
      format: row.format,
      title: row.title,
      prize_cents: row.prize_cents,
      entry_cents: row.entry_cents,
    })
  );
});
matchupTx(sampleMatchups);

const insertTournament = db.prepare(`
  INSERT INTO tournaments (game_id, title, format, tier, prize_cents, entry_cents, status)
  VALUES (@game_id, @title, @format, @tier, @prize_cents, @entry_cents, 'open')
`);

const sampleTournaments = [
  { slug: "black-ops-7", title: "$75 GTD — Amateur/Expert, No Respawns, Switcharoo", format: "3v3 · Bo3", tier: "expert", prize_cents: 7500, entry_cents: 100 },
  { slug: "black-ops-7", title: "$150 GTD — All Skills, No Golds, Search & Destroy", format: "3v3 · Bo3", tier: "amateur", prize_cents: 15000, entry_cents: 1000 },
  { slug: "black-ops-7", title: "$90 GTD — Free Entry, All Skills, Search & Destroy", format: "3v3 · Bo1", tier: "novice", prize_cents: 9000, entry_cents: 0 },
  { slug: "valorant", title: "$400 GTD — Expert Only, Standard Competitive Ruleset", format: "5v5 · Bo3", tier: "expert", prize_cents: 40000, entry_cents: 2000 },
  { slug: "rocket-league", title: "$180 GTD — All Skills, Standard Rules", format: "2v2 · Bo3", tier: "amateur", prize_cents: 18000, entry_cents: 500 },
];

const tournamentTx = db.transaction((rows) => {
  rows.forEach((row) =>
    insertTournament.run({
      game_id: gameIdBySlug[row.slug],
      title: row.title,
      format: row.format,
      tier: row.tier,
      prize_cents: row.prize_cents,
      entry_cents: row.entry_cents,
    })
  );
});
tournamentTx(sampleTournaments);

console.log("Seed complete: games + sample matchups + sample tournaments inserted.");
