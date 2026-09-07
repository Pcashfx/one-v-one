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
 * DEPOSIT / WITHDRAWAL — still NOT connected to a real payment rail.
 * ---------------------------------------------------------------------
 * Identity verification IS now wired up for real (see ../routes/kyc.js
 * and ../routes/kycWebhook.js — Stripe Identity), so withdraw correctly
 * blocks until users.identity_verified is true. What's still missing is
 * the actual money movement: a payment-provider account (Stripe Connect
 * is not usable for this category — see conversation history/README —
 * so realistically a specialist high-risk/skill-gaming processor like
 * PaymentCloud, Durango Merchant Services, or Paysafe once you have one
 * approved), wired in below.
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

    const verified = await isIdentityVerified(req.userId);
    if (!verified) {
      return res.status(403).json({
        error: "Identity verification is required before withdrawing.",
        verifyUrl: "/api/kyc/start",
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

async function isIdentityVerified(userId) {
  const result = await query("SELECT identity_verified FROM users WHERE id = $1", [userId]);
  return !!(result.rows[0] && result.rows[0].identity_verified);
}

module.exports = router;
