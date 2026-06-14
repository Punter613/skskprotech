export async function onRequestPost({ request }) {
  const body = await request.json().catch(() => ({}));

  return new Response(JSON.stringify({
    success: true,
    result: {
      jobType: 'Diagnosis',
      vin: body.vin || '',
      symptoms: body.symptoms || [],
      codes: body.codes || [],
      notes: body.notes || []
    }
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
