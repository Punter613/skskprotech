const PDFDocument = require('pdfkit');

function generateInvoicePdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text('SKSK PROTECH INVOICE', { align: 'center' });
    doc.moveDown();

    doc.fontSize(12);
    doc.text(`Invoice ID: ${data.invoiceId || 'N/A'}`);
    doc.text(`Customer: ${data.customer?.name || data.customer || 'N/A'}`);
    doc.text(`Phone: ${data.customer?.phone || 'N/A'}`);
    doc.text(`Email: ${data.customer?.email || 'N/A'}`);
    doc.text(`VIN: ${data.vin || 'N/A'}`);
    doc.text(`Decoded Year: ${data.vinDecoded?.year || data.vehicle?.year || 'N/A'}`);
    doc.text(`Decoded Make: ${data.vinDecoded?.make || data.vehicle?.make || 'N/A'}`);
    doc.text(`Decoded Model: ${data.vinDecoded?.model || data.vehicle?.model || 'N/A'}`);
    doc.text(`Total: $${Number(data.total || 0).toFixed(2)}`);
    doc.moveDown();

    doc.text('Details:');
    doc.fontSize(10).text(JSON.stringify(data.details || {}, null, 2));

    doc.end();
  });
}

module.exports = { generateInvoicePdf };
