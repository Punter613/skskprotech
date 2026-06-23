const express = require('express');
const router = express.Router();

router.use('/full-estimate', require('./full-estimate'));
router.use('/scrape', require('./scrape'));
router.use('/jobs', require('./jobs'));
router.use('/parts-lookup', require('./partsLookup'));

module.exports = router;
