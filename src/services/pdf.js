const PDFDocument = require('pdfkit');

module.exports = function generateInvoicePDF(invoiceData, estimateData) {
  const doc = new PDFDocument();

  // Vehicle fields
  const year = estimateData?.vehicle?.year || '—';
  const make = estimateData?.vehicle?.make || '—';
  const model = estimateData?.vehicle?.model || '—';

  doc.fontSize(16).text('SKSK ProTech Invoice', 50, 50);
  doc.fontSize(12).text(`Customer: ${invoiceData.customerName}`, 50, 100);
  doc.text(`Total: $${invoiceData.total}`, 50, 130);

  // Injected vehicle line
  doc.text(`Vehicle: ${year} ${make} ${model}`, 50, 160);

  doc.end();
  return doc;
};
