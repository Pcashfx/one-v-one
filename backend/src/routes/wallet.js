const express = require("express");
const { z } = require("zod");
const { db } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, (req, res) => {
  const user = db.prepare("SELECT balance_cents FROM users WHERE id = ?").get(req.userId);
  const transactions = db
    .prepare(
      "SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
    )
    .all(req.userId);
  res.json({
    balanceCents: user.balance_cents,
    transactions: transactions.map((t) => ({
      id: t.id,
      amountCents: t.amount_cents,
      type: t.type,
      reference: t.reference,
      createdAt: t.created_at,
    })),
  });
});

/**
 * ---------------------------------------------------------------------
 * DEPOSIT / WITHDRAWAL — NOT connected to a real payment rail.
 * ---------------------------------------------------------------------
 * Real money movement requires an account with a licensed payment
 * processor or money-transmitter partner, opened under your business
 * entity and approved through their underwriting/compliance review.
 * Skill-based cash gaming is generally treated as "high-risk" by
 * mainstream processors, so the realistic options are:
 *
 *   - Stripe (Connect + Identity) — if your business is approved for
 *     this category; Stripe reviews use-case at signup.
 *   - A specialist high-risk processor (e.g. Trustly, Worldpay for
 *     Platforms, or a payments partner that explicitly supports
 *     skill-gaming/fantasy sports) if Stripe declines the category.
 *   - A KYC/identity provider (Stripe Identity, Persona, Veriff, Onfido)
 *     wired in BEFORE a user's first withdrawal or first paid entry,
 *     since most states require verified age/identity for real-money
 *     skill competitions.
 *
 * Below are the two integration points, stubbed so the rest of the app
 * (routes, wallet ledger, front-end) works end-to-end today. Replace the
 * body of each function with a real SDK call once you have a provider
 * account and have confirmed you're legally permitted to operate.
 * ---------------------------------------------------------------------
 */

const depositSchema = z.object({ amountCents: z.number().int().positive() });

router.post("/deposit", requireAuth, async (req, res) => {
  const parsed = depositSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid amount." });

  try {
    // TODO: replace with a real payment-provider call, e.g.
    //   const intent = await stripe.paymentIntents.create({ amount, currency, customer });
    //   return res.json({ clientSecret: intent.client_secret });
    // and only credit the ledger from a verified webhook, not this response.
    await createPaymentIntentStub(req.userId, parsed.data.amountCents);

    return res.status(501).json({
      error:
        "Deposits are not enabled yet — no payment provider is connected. See src/routes/wallet.js.",
    });
  } catch (err) {
    return res.status(502).json({ error: "Payment provider error." });
  }
});

const withdrawSchema = z.object({ amountCents: z.number().int().positive() });

router.post("/withdraw", requireAuth, async (req, res) => {
  const parsed = withdrawSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid amount." });

  const user = db.prepare("SELECT balance_cents FROM users WHERE id = ?").get(req.userId);
  if (user.balance_cents < parsed.data.amountCents) {
    return res.status(402).json({ error: "Insufficient balance." });
  }

  const verified = await isIdentityVerifiedStub(req.userId);
  if (!verified) {
    return res.status(403).json({
      error: "Identity verification is required before withdrawing. See src/routes/wallet.js.",
    });
  }

  // TODO: replace with a real payout call to your processor, then only
  // debit the ledger once the payout is confirmed (or use a webhook).
  return res.status(501).json({
    error:
      "Withdrawals are not enabled yet — no payment provider is connected. See src/routes/wallet.js.",
  });
});

async function createPaymentIntentStub(_userId, _amountCents) {
  // Intentionally not implemented. Wire up your provider's SDK here.
  return null;
}

async function isIdentityVerifiedStub(_userId) {
  // Intentionally always false until a real KYC provider is connected
  // (e.g. check a `users.identity_verified` column set by a webhook
  // from Stripe Identity / Persona / Veriff after a successful check).
  return false;
}

module.exports = router;
