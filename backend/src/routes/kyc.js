const express = require("express");
const { query } = require("../db");
const { requireAuth } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  // Lazy-required so the app can still boot without the `stripe` package
  // configured/installed key present — it only throws when this endpoint
  // is actually hit without a key set.
  const Stripe = require("stripe");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

// Starts a Stripe Identity verification session for the signed-in user and
// returns a hosted URL to redirect them to. The user completes document +
// selfie verification on Stripe's own page — we never see or store the ID
// photo ourselves, only the pass/fail result via webhook.
router.post(
  "/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(501).json({
        error: "Identity verification isn't configured yet (missing STRIPE_SECRET_KEY).",
      });
    }

    const userResult = await query("SELECT * FROM users WHERE id = $1", [req.userId]);
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: "User not found." });
    if (user.identity_verified) {
      return res.json({ alreadyVerified: true });
    }

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5500";

    const session = await stripe.identity.verificationSessions.create({
      type: "document",
      metadata: { userId: String(user.id) },
      options: { document: { require_matching_selfie: true } },
      return_url: `${frontendUrl}/verify.html?status=complete`,
    });

    await query("UPDATE users SET identity_verification_session_id = $1 WHERE id = $2", [
      session.id,
      user.id,
    ]);

    res.json({ url: session.url });
  })
);

router.get(
  "/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await query("SELECT identity_verified FROM users WHERE id = $1", [req.userId]);
    if (!result.rows[0]) return res.status(404).json({ error: "User not found." });
    res.json({ verified: !!result.rows[0].identity_verified });
  })
);

module.exports = router;
