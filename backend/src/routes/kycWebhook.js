const express = require("express");
const { query } = require("../db");

const router = express.Router();

// IMPORTANT: this route must receive the raw request body (not JSON-parsed)
// so Stripe's signature can be verified — that's why it uses express.raw()
// here instead of relying on the app-wide express.json() middleware, and
// why server.js mounts this route BEFORE that middleware is registered.
router.post("/", express.raw({ type: "application/json" }), async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(501).send("Webhook not configured.");
  }

  const Stripe = require("stripe");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "identity.verification_session.verified") {
      const session = event.data.object;
      const userId = session.metadata && session.metadata.userId;
      if (userId) {
        await query("UPDATE users SET identity_verified = true WHERE id = $1", [userId]);
      }
    }
    // identity.verification_session.requires_input fires on failed/incomplete
    // checks — worth logging to a support queue in a real implementation so
    // a human can follow up, rather than leaving the user stuck silently.
  } catch (err) {
    console.error("Error handling Stripe webhook event:", err);
    // Still return 200 so Stripe doesn't retry indefinitely for a bug on our
    // side; the event is logged above for manual follow-up.
  }

  res.json({ received: true });
});

module.exports = router;
