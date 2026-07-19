const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');

/**
 * POST /api/invoice
 * Generates an automated PDF invoice using global sanitized input filters.
 */
router.post('/', require('../middleware/clean.input'), async (req, res) => {
  try {
    // 1. Leverage the hyper-dense sanitized arrays straight from our middleware
    const { vehicle, vin, mileage, obdCodes, symptoms, laborRate, parts, partsCost, customer } = req.sanitized;

    // Pull or fallback structural fields passed from the frontend generation pass
    const estimatedHours = Math.max(0, Number(req.body.estimatedHours) || 1.5);
    const calculatedLabor = laborRate * estimatedHours;
    const finalInvoiceTotal = calculatedLabor + partsCost;

    // 2. Initialize layout document bounds
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice_${vehicle.make || 'Vehicle'}.pdf"`);
    doc.pipe(res);

    // 3. HEADER BLOCK (Commercial Layout Style)
    doc.fillColor('#c1121f').fontSize(26).font('Helvetica-Bold').text('SKSK ProTech', { align: 'left' });
    doc.fillColor('#666666').fontSize(9).font('Helvetica').text('Professional Mobile Diagnostics & Heavy Repair', { align: 'left' });

    // Invoice Meta (Top Right Align Alignment Grid)
    doc.fillColor('#000000').fontSize(16).font('Helvetica-Bold').text('WORK ORDER / INVOICE', 350, 50, { align: 'right', width: 210 });
    doc.fillColor('#333333').fontSize(9).font('Helvetica').text(`Date: ${new Date().toLocaleDateString()}`, 350, 70, { align: 'right', width: 210 });
    doc.text(`Status: Balance Due`, 350, 82, { align: 'right', width: 210 });

    doc.moveDown(3);
    const startY = Math.max(doc.y, 110);

    // 4. CLIENT & VEHICLE PROFILE GRID (Side-by-Side Double Column Box Layout)
    // Left Column: Customer Information
    doc.fillColor('#101015').fontSize(11).font('Helvetica-Bold').text('BILL TO:', 50, startY);
    doc.fillColor('#000000').fontSize(10).font('Helvetica');
    doc.text(`Name:  ${customer.name}`, 50, startY + 16);
    doc.text(`Phone: ${customer.phone}`, 50, startY + 28);

    // Right Column: Vehicle Diagnostics Specification Telemetry
    doc.fillColor('#101015').fontSize(11).font('Helvetica-Bold').text('VEHICLE & FLEET SPECS:', 320, startY);
    doc.fillColor('#000000').fontSize(10).font('Helvetica');
    doc.text(`Year/Make/Model: ${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim ? `(${vehicle.trim})` : ''}`, 320, startY + 16);
    doc.text(`VIN Array Target: ${vin || 'N/A'}`, 320, startY + 28);
    doc.text(`Odometer Log:     ${mileage.toLocaleString()} Miles`, 320, startY + 40);

    doc.moveDown(4);
    let tableY = Math.max(doc.y, startY + 70);

    // 5. ITEMIZED CHARGES TABLE (Clean Grid Layout Line-By-Line)
    doc.rect(50, tableY, 512, 20).fill('#101015');
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
    doc.text('DESCRIPTION / LINE ITEM SERVICES', 60, tableY + 6);
    doc.text('TOTAL PRICE', 480, tableY + 6, { align: 'right', width: 70 });

    let currentY = tableY + 20;
    doc.fillColor('#000000').font('Helvetica').fontSize(10);

    // Line Item A: Certified Mobile Labor Operations Block
    doc.rect(50, currentY, 512, 24).strokeColor('#e0e0e0').lineWidth(0.5).stroke();
    doc.text(`Automotive Field Labor Services (${estimatedHours.toFixed(1)} Hours @ $${laborRate.toFixed(2)}/hr)`, 60, currentY + 7);
    doc.text(`$${calculatedLabor.toFixed(2)}`, 480, currentY + 7, { align: 'right', width: 70 });
    currentY += 24;

    // Line Item B: Loop Through Individual Itemized Parts Arrays Cleanly
    if (parts && parts.length > 0) {
      parts.forEach(part => {
        doc.rect(50, currentY, 512, 24).stroke();
        doc.text(`Part: ${part.name || 'Component Replacement Hardware'}`, 60, currentY + 7);
        doc.text(`$${Number(part.cost || 0).toFixed(2)}`, 480, currentY + 7, { align: 'right', width: 70 });
        currentY += 24;
      });
    } else if (partsCost > 0) {
      // Fallback baseline tier if client passed flat cumulative parts expense amounts
      doc.rect(50, currentY, 512, 24).stroke();
      doc.text('Automotive Replacement Hardware Components Package', 60, currentY + 7);
      doc.text(`$${partsCost.toFixed(2)}`, 480, currentY + 7, { align: 'right', width: 70 });
      currentY += 24;
    }

    // Line Item C: Captured Ingestion Logs Mapped to Line Descriptions
    if (symptoms && symptoms.length > 0) {
      doc.rect(50, currentY, 512, 24).stroke();
      doc.text(`Diagnostic Profiles Evaluated: ${symptoms.slice(0, 3).join(', ')} ${obdCodes.length ? `[${obdCodes.join(', ')}]` : ''}`, 60, currentY + 7, { width: 400, lineBreak: false });
      doc.text('$0.00', 480, currentY + 7, { align: 'right', width: 70 });
      currentY += 24;
    }

    currentY += 15;

    // 6. TOTAL BALANCE DUE CALCULATION CONTAINER (Defends against layout shifting)
    doc.rect(330, currentY, 232, 45).fill('#101015');
    doc.fillColor('#ffffff').fontSize(13).font('Helvetica-Bold');
    doc.text(`TOTAL AMOUNT DUE:`, 340, currentY + 16, { align: 'left' });
    doc.text(`$${finalInvoiceTotal.toFixed(2)}`, 480, currentY + 16, { align: 'right', width: 70 });

    // 7. FOOTER POLICY
    doc.fillColor('#777777').fontSize(8).font('Helvetica-Oblique');
    doc.text('Thank you for choosing SKSK ProTech. All mobile service operations carry a baseline field validation guarantee. Terms: Balance due upon vehicle completion.', 50, 700, { align: 'center', width: 512 });

    doc.end();
    console.log(`[Invoice] Hardened PDF Generated for ${customer.name} - Total: $${finalInvoiceTotal.toFixed(2)}`);

  } catch (err) {
    console.error('[Invoice Error] PDF generation aborted:', err.message || err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Failed to stitch together PDF artifact.', details: err.message });
    }
  }
});

module.exports = router;
