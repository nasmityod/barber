import { ensureDatabase } from "../../../../../db/init";
import { assertSameOrigin, cleanText, enforceRateLimit, errorResponse, getAdminContext, HttpError, isEmail, isPhone, normalizeEmail, writeAudit } from "../../../../security";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await getAdminContext("clients.write");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Selecciona un archivo CSV.");
    if (file.size > 2_000_000) throw new HttpError(413, "El CSV no puede superar 2 MB.");
    const rows = parseCsv(await file.text());
    if (!rows.length) throw new HttpError(400, "El CSV está vacío.");
    const db = await ensureDatabase();
    await enforceRateLimit(db, `client-import:${context.user.userId}`, 5, 60 * 60 * 1000);
    let imported = 0; let updated = 0; let skipped = 0;
    for (const row of rows.slice(0, 1000)) {
      const name = cleanText(row.nombre ?? row.name ?? "", 100);
      const emailValue = normalizeEmail(row.email ?? row.correo ?? "");
      const phone = cleanText(row.telefono ?? row.phone ?? "", 25) || "Sin teléfono";
      const notes = cleanText(row.notas ?? row.notes ?? "", 1000);
      if (name.length < 2 || (emailValue && !isEmail(emailValue)) || (phone !== "Sin teléfono" && !isPhone(phone))) { skipped++; continue; }
      const email = emailValue || `import-${crypto.randomUUID()}@local.invalid`;
      const existing = await db.prepare("SELECT id FROM clients WHERE business_id = ? AND email = ?").bind(context.businessId, email).first<{ id: string }>();
      if (existing) {
        await db.prepare("UPDATE clients SET name = ?, phone = ?, notes = ? WHERE id = ? AND business_id = ?").bind(name, phone, notes, existing.id, context.businessId).run();
        updated++;
      } else {
        await db.prepare("INSERT INTO clients (id,business_id,name,email,phone,notes,created_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(), context.businessId, name, email, phone, notes, new Date().toISOString()).run();
        imported++;
      }
    }
    await writeAudit(db, { businessId: context.businessId, user: context.user, action: "clients.imported", entityType: "client", metadata: { imported, updated, skipped } });
    return Response.json({ imported, updated, skipped, total: rows.length });
  } catch (error) {
    return errorResponse(error);
  }
}

function parseCsv(input: string) {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i]; const next = input[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i++; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === "," && !quoted) { row.push(cell.trim()); cell = ""; continue; }
    if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && next === "\n") i++; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; continue; }
    cell += char;
  }
  if (cell || row.length) { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); }
  if (rows.length < 2) return [];
  const headers = rows.shift()!.map((header) => header.replace(/^\uFEFF/u, "").trim().toLowerCase());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}
