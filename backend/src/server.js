require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { initSchema } = require("./db");

const authRoutes = require("./routes/auth");
const matchupRoutes = require("./routes/matchups");
const tournamentRoutes = require("./routes/tournaments");
const leaderboardRoutes = require("./routes/leaderboard");
const walletRoutes = require("./routes/wallet");
const gameRoutes = require("./routes/games");
const kycRoutes = require("./routes/kyc");
const kycWebhookRoutes = require("./routes/kycWebhook");

const app = express();
const allowedOrigins = (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
  })
);

// Mounted BEFORE express.json() below: Stripe webhook signature
// verification needs the raw, unparsed request body. This route parses
// its own body with express.raw() internally — see routes/kycWebhook.js.
app.use("/api/kyc/webhook", kycWebhookRoutes);

app.use(express.json());

// Basic rate limiting on auth endpoints to slow down credential stuffing /
// brute-force attempts. Tune limits for your real traffic before launch.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
app.use("/api/auth", authLimiter);

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/matchups", matchupRoutes);
app.use("/api/tournaments", tournamentRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/games", gameRoutes);
app.use("/api/kyc", kycRoutes);

app.use((req, res) => res.status(404).json({ error: "Not found." }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

const port = process.env.PORT || 4000;

async function start() {
  await initSchema();
  app.listen(port, () => {
    console.log(`One V One API listening on http://localhost:${port}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
