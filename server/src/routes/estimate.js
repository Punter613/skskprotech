const express = require('express');
const router = express.Router();
router.post('/', (req, res) => res.json({ status: "Estimate pipeline online" }));
module.exports = router;
