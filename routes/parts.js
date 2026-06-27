const express = require('express');
const router = express.Router();
const { lookupParts } = require('../services/partsLookup');

router.post('/search', async (req, res) => {
  try {
    const { year, make, model, partType, part_number, name, vin } = req.body || {};

    const hasVehicleSearch = year && make && model && partType;
    const hasDirectSearch = part_number || name;

    if (!hasVehicleSearch && !hasDirectSearch) {
      return res.status(400).json({
        success: false,
        error: 'Provide either year/make/model/partType or part_number/name.'
      });
    }

    const result = await lookupParts({
      year,
      make,
      model,
      partType,
      part_number,
      name,
      vin
    });

    return res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[Parts Route Error]', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to search parts.'
    });
  }
});

module.exports = router;
