const express = require("express");
const router = express.Router();
const { lookupPart } = require("../services/partsLookup");

router.post("/", async (req, res) => {
  try {
    const { part_number, name, vin, vehicle } = req.body;
    const searchTarget = part_number || name;

    if (!searchTarget) return res.status(400).json({ ok: false, error: "Missing part name or number" });

    const results = await lookupPart(searchTarget, vin, vehicle);
    res.json({
      ok: true,
      local: results.local,
      online: results.online
    });
  } catch (err) {
    console.error("parts-lookup:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
