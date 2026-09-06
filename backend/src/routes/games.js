const express = require("express");
const { db } = require("../db");

const router = express.Router();

router.get("/", (req, res) => {
  const games = db.prepare("SELECT id, name, slug, platform FROM games ORDER BY name").all();
  res.json({ games });
});

module.exports = router;
