import { ensureDatabase } from "../../../../../db/init";
import { errorResponse, getAdminContext, HttpError } from "../../../../security";

export async function GET() {
  try {
    const context = await getAdminContext("clients.read");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const db = await ensureDatabase();
    const rows = await db.prepare(`SELECT name,email,phone,notes,created_at AS createdAt
      FROM clients WHERE business_id = ? ORDER BY name COLLATE NOCASE`).bind(context.businessId).all();
    const csv = ["nombre,email,telefono,notas,creado_en", ...(rows.results ?? []).map((row) => [row.name, row.email, row.phone, row.notes, row.createdAt].map(csvCell).join(","))].join("\r\n");
    return new Response(`\uFEFF${csv}\r\n`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="clientes-${context.businessSlug}.csv"`, "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
