const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { db } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const registerSchema = z.object({
  username: z.string().trim().min(3).max(24),
  email: z.string().trim().email(),
  password: z.string().min(6).max(100),
  ageConfirmed: z.boolean(),
  termsAccepted: z.boolean(),
});

router.post("/register", async (req, res) => {
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

  const existing = db
    .prepare("SELECT id FROM users WHERE email = ? OR username = ?")
    .get(email, username);
  if (existing) {
    return res.status(409).json({ error: "That email or username is already in use." });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const result = db
    .prepare(`
      INSERT INTO users (username, email, password_hash, age_confirmed, terms_accepted)
      VALUES (?, ?, ?, 1, 1)
    `)
    .run(username, email, passwordHash);

  const token = signToken(result.lastInsertRowid);
  res.status(201).json({
    token,
    user: publicUser(getUserById(result.lastInsertRowid)),
  });
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Enter a valid email and password." });
  }
  const { email, password } = parsed.data;

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }

  const token = signToken(user.id);
  res.json({ token, user: publicUser(user) });
});

router.get("/me", requireAuth, (req, res) => {
  const user = getUserById(req.userId);
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json({ user: publicUser(user) });
});

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

function getUserById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
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
