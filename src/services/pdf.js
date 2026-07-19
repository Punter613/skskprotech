const PDFDocument = require('pdfkit');

function generateInvoicePdf(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      const primaryColor = '#c1121f';
      const darkColor = '#1a1a2e';
      const textColor = '#333333';
      const lightGray = '#f5f5f5';

      // Header
      doc.rect(0, 0, doc.page.width, 120).fill(darkColor);
      doc.fillColor('#ffffff').fontSize(28).text('SKSK PROTECH', 50, 35);
      doc.fontSize(14).text('Mobile Mechanic Services', 50, 70);
      doc.fontSize(10).text('Professional Auto Repair Estimates & Invoicing', 50, 90);

      // Invoice title and date
      const rightX = doc.page.width - 200;
      doc.fillColor('#ffffff').fontSize(20).text('INVOICE', rightX, 35);
      doc.fontSize(10).text(`Date: ${new Date().toLocaleDateString('en-US')}`, rightX, 60);
      doc.text(`Invoice #: ${data.invoiceId || 'N/A'}`, rightX, 75);

      // Customer info section
      doc.fillColor(textColor).fontSize(14).text('BILL TO', 50, 145);
      doc.moveDown(0.3);
      doc.fontSize(11);
      const customer = data.customer || {};
      doc.text(customer.name || customer || 'N/A');
      if (customer.phone) doc.text(`Phone: ${customer.phone}`);
      if (customer.email) doc.text(`Email: ${customer.email}`);

      // Vehicle info
      if (data.vin || data.vehicle) {
        doc.moveDown(0.5);
        doc.fontSize(14).fillColor(primaryColor).text('VEHICLE INFORMATION');
        doc.fillColor(textColor).fontSize(11);
        if (data.vin) doc.text(`VIN: ${data.vin}`);
        const v = data.vehicle || data.vinDecoded || {};
        if (v.year || v.make || v.model) {
          doc.text(`Vehicle: ${[v.year, v.make, v.model].filter(Boolean).join(' ')}`);
        }
      }

      // Divider
      doc.moveDown(0.8);
      doc.strokeColor(primaryColor).lineWidth(2).moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
      doc.moveDown(0.8);

      // Charges table
      doc.fontSize(14).fillColor(primaryColor).text('CHARGES');
      doc.moveDown(0.3);

      const startY = doc.y;
      const colDesc = 50;
      const colAmount = doc.page.width - 150;

      // Table header background
      doc.rect(colDesc - 5, startY - 5, doc.page.width - 100, 25).fill(lightGray);
      doc.fillColor(darkColor).fontSize(11);
      doc.text('Description', colDesc, startY);
      doc.text('Amount', colAmount, startY);

      doc.moveDown(0.8);

      // Table rows
      doc.fillColor(textColor).fontSize(11);

      const laborCost = Number(data.laborCost || data.labor || 0);
      const partsCost = Number(data.partsCost || data.parts || 0);
      const subtotal = Number(data.total || 0) || (laborCost + partsCost);
      const tax = Number(data.tax || 0);
      const total = subtotal + tax;

      if (laborCost > 0) {
        doc.text('Labor', colDesc);
        doc.text(`$${laborCost.toFixed(2)}`, colAmount);
        doc.moveDown(0.3);
      }

      if (partsCost > 0) {
        doc.text('Parts', colDesc);
        doc.text(`$${partsCost.toFixed(2)}`, colAmount);
        doc.moveDown(0.3);
      }

      if (tax > 0) {
        doc.text('Tax', colDesc);
        doc.text(`$${tax.toFixed(2)}`, colAmount);
        doc.moveDown(0.3);
      }

      if (laborCost === 0 && partsCost === 0 && tax === 0) {
        doc.text('Service', colDesc);
        doc.text(`$${subtotal.toFixed(2)}`, colAmount);
        doc.moveDown(0.3);
      }

      // Divider before total
      doc.moveDown(0.5);
      doc.strokeColor('#dddddd').lineWidth(1).moveTo(colDesc, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
      doc.moveDown(0.5);

      // Total
      doc.fontSize(16).fillColor(darkColor).text('TOTAL:', colDesc);
      doc.fillColor(primaryColor).fontSize(18).text(`$${total.toFixed(2)}`, colAmount);

      // Notes
      if (data.notes) {
        doc.moveDown(1.5);
        doc.fontSize(12).fillColor(darkColor).text('NOTES');
        doc.moveDown(0.2);
        doc.fillColor(textColor).fontSize(10).text(data.notes, { width: doc.page.width - 100 });
      }

      // Footer
      const footerY = doc.page.height - 80;
      doc.rect(0, footerY, doc.page.width, 80).fill(darkColor);
      doc.fillColor('#ffffff').fontSize(10).text(
        'Thank you for choosing SKSK ProTech! | Questions? Contact your mobile mechanic.',
        50, footerY + 30,
        { align: 'center', width: doc.page.width - 100 }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateInvoicePdf };
