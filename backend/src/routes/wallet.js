const express = require("express");
const { z } = require("zod");
const { query } = require("../db");
const { requireAuth } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userResult = await query("SELECT balance_cents FROM users WHERE id = $1", [req.userId]);
    const txResult = await query(
      "SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
      [req.userId]
    );
    res.json({
      balanceCents: userResult.rows[0].balance_cents,
      transactions: txResult.rows.map((t) => ({
        id: t.id,
        amountCents: t.amount_cents,
        type: t.type,
        reference: t.reference,
        createdAt: t.created_at,
      })),
    });
  })
);

/**
 * ---------------------------------------------------------------------
 * DEPOSIT / WITHDRAWAL — NOT connected to a real payment rail.
 * ---------------------------------------------------------------------
 * See the equivalent note in the previous SQLite version of this file —
 * unchanged: this needs a real payment-provider account (Stripe Connect,
 * or a specialist high-risk/skill-gaming processor) and a real identity
 * verification provider (Stripe Identity, Persona, Veriff) before any of
 * this can move real money. The two stub functions below are the exact
 * points to wire that in.
 * ---------------------------------------------------------------------
 */

const depositSchema = z.object({ amountCents: z.number().int().positive() });

router.post(
  "/deposit",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = depositSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid amount." });

    await createPaymentIntentStub(req.userId, parsed.data.amountCents);
    return res.status(501).json({
      error: "Deposits are not enabled yet — no payment provider is connected. See src/routes/wallet.js.",
    });
  })
);

const withdrawSchema = z.object({ amountCents: z.number().int().positive() });

router.post(
  "/withdraw",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = withdrawSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid amount." });

    const userResult = await query("SELECT balance_cents FROM users WHERE id = $1", [req.userId]);
    if (userResult.rows[0].balance_cents < parsed.data.amountCents) {
      return res.status(402).json({ error: "Insufficient balance." });
    }

    const verified = await isIdentityVerifiedStub(req.userId);
    if (!verified) {
      return res.status(403).json({
        error: "Identity verification is required before withdrawing. See src/routes/wallet.js.",
      });
    }

    return res.status(501).json({
      error: "Withdrawals are not enabled yet — no payment provider is connected. See src/routes/wallet.js.",
    });
  })
);

async function createPaymentIntentStub(_userId, _amountCents) {
  return null;
}

async function isIdentityVerifiedStub(_userId) {
  return false;
}

module.exports = router;
