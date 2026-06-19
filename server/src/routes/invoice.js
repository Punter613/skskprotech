const express = require('express');
const router = express.Router();
router.post('/', (req, res) => res.json({ status: "Invoice pipeline online" }));
module.exports = router;
