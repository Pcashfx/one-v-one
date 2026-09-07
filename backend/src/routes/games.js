const express = require("express");
const { query } = require("../db");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const result = await query("SELECT id, name, slug, platform FROM games ORDER BY name");
    res.json({ games: result.rows });
  })
);

module.exports = router;
