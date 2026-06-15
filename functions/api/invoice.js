// Cloudflare Pages Function — matches Express route response shape
export async function onRequestPost({ request }) {
  let body = {};
  try { body = await request.json(); } catch {}

  const invoiceId = body.invoiceNumber ? `INV-${body.invoiceNumber}` : `INV-${Date.now()}`;

  const invoice = {
    invoiceId,
    total: Number(body.total || 0),
    customer: body.customer || {},
    notes: body.notes || ''
  };

  return Response.json({ success: true, invoice });
}
