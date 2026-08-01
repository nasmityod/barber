export async function GET() {
  return Response.json({ error: "Endpoint retirado. Usa la API autenticada." }, { status: 410, headers: { "cache-control": "no-store" } });
}

export async function POST() {
  return Response.json({ error: "Endpoint retirado. Usa la API de reservas." }, { status: 410, headers: { "cache-control": "no-store" } });
}
