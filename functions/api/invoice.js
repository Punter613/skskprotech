export async function onRequestPost({ request }) {
  const body = await request.json().catch(() => ({}));

  return new Response(JSON.stringify({
    success: true,
    invoice: {
      invoiceId: `INV-${Date.now()}`,
      total: Number(body.total || 0),
      customer: body.customer || {}
    }
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
