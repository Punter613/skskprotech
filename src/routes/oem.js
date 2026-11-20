const express = require('express');
const router = express.Router();

// Durable-first knowledge coverage planner, mounted here so its existing
// /api/knowledge-builder paths stay unchanged.
//
// The legacy /api/oem-data/:vin/:procedure bridge was removed: it was mounted
// without authentication and built a shell command from request input for a
// ./lemon-core binary that is not part of this repository. Do not reintroduce
// shell execution on a request path.
router.use('/api/knowledge-builder', require('./knowledge.builder'));

module.exports = router;
