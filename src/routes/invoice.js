const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');

/**
 * POST /api/invoice
 * Generates an on-the-fly PDF invoice and streams the binary file directly to the device.
 */
router.post('/', async (req, res) => {
  try {
    const { customer = {}, vehicle = {}, estimateText = "No estimate provided.", totalAmount = "0.00" } = req.body;

    // 1. Create a blank PDF document in system memory
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });

    // 2. Configure HTTP response headers so the mobile device treats it as a download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Estimate_${vehicle.make || 'Vehicle'}.pdf"`);

    // 3. Pipe the PDF generator stream directly into the Express HTTP response object
    doc.pipe(res);

    // 4. Build out the visual layout of the PDF
    doc.fillColor('#c1121f').fontSize(26).text('SKSK ProTech', { align: 'left' });
    doc.fillColor('#b7b7c2').fontSize(10).text('Mobile Mechanic AI Auto Estimator', { align: 'left' });
    doc.moveDown(2);

    // Customer / Vehicle Info Block
    doc.fillColor('#101015').fontSize(14).text('CUSTOMER & VEHICLE DETAILS', { underline: true });
    doc.fontSize(11).fillColor('#000000');
    doc.text(`Customer Name: ${customer.name || 'Generic Customer'}`);
    doc.text(`Contact Phone: ${customer.phone || 'N/A'}`);
    doc.text(`Vehicle: ${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''} (${vehicle.trim || 'Standard'})`);
    doc.moveDown(1.5);

    // Job Details Block
    doc.fontSize(14).fillColor('#101015').text('ITEMIZED JOB SUMMARY', { underline: true });
    doc.fontSize(10).fillColor('#333333');
    doc.moveDown(0.5);
    doc.text(estimateText, { align: 'left', width: 500 });
    doc.moveDown(2);

    // Total Price Box
    doc.rect(350, doc.y, 200, 40).fill('#101015');
    doc.fillColor('#ffffff').fontSize(14).text(`TOTAL DUE: $${totalAmount}`, 360, doc.y + 12, { align: 'center' });

    // 5. Finalize and seal the stream
    doc.end();
    console.log('[Invoice] PDF streamed successfully over HTTP payload.');

  } catch (err) {
    console.error('[Invoice Error] PDF generation aborted:', err.message || err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Failed to stitch together PDF artifact.' });
    }
  }
});

module.exports = router;
