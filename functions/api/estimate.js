export async function onRequestPost({ request }) {
  const body = await request.json().catch(() => ({}));
  const labor = Number(body.labor || 120);
  const parts = Number(body.parts || 80);

  return new Response(JSON.stringify({
    success: true,
    estimate: {
      labor,
      parts,
      total: labor + parts,
      vin: body.vin || ''
    }
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
