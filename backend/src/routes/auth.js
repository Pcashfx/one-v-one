const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { query } = require("../db");
const { requireAuth } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

const registerSchema = z.object({
  username: z.string().trim().min(3).max(24),
  email: z.string().trim().email(),
  password: z.string().min(6).max(100),
  ageConfirmed: z.boolean(),
  termsAccepted: z.boolean(),
});

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input.", details: parsed.error.flatten() });
    }
    const { username, email, password, ageConfirmed, termsAccepted } = parsed.data;

    if (!ageConfirmed || !termsAccepted) {
      return res.status(400).json({
        error: "You must confirm you meet the age requirement and accept the terms.",
      });
    }

    const existing = await query("SELECT id FROM users WHERE email = $1 OR username = $2", [email, username]);
    if (existing.rows.length) {
      return res.status(409).json({ error: "That email or username is already in use." });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await query(
      `INSERT INTO users (username, email, password_hash, age_confirmed, terms_accepted)
       VALUES ($1, $2, $3, true, true)
       RETURNING *`,
      [username, email, passwordHash]
    );
    const user = result.rows[0];

    const token = signToken(user.id);
    res.status(201).json({ token, user: publicUser(user) });
  })
);

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Enter a valid email and password." });
    }
    const { email, password } = parsed.data;

    const result = await query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }

    const token = signToken(user.id);
    res.json({ token, user: publicUser(user) });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await query("SELECT * FROM users WHERE id = $1", [req.userId]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json({ user: publicUser(user) });
  })
);

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    balanceCents: user.balance_cents,
  };
}

module.exports = router;
