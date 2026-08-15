import { ensureDatabase } from "../../../../db/init";
import {
  assertSameOrigin, cleanText, enforceRateLimit, errorResponse, getAdminContext,
  hasPermission, HttpError, readJson, writeAudit,
} from "../../../security";

type ResourcePayload = { id?: unknown; name?: unknown; kind?: unknown; notes?: unknown; serviceIds?: unknown; professionalIds?: unknown; active?: unknown };
type ResourceRow = { id:string; name:string; kind:string; notes:string; serviceIds:string; professionalIds:string; active:number; appointmentCount:number; createdAt:string; updatedAt:string };

export async function GET() {
  try {
    const context = await getAdminContext("professionals.read");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const db = await ensureDatabase();
    const result = await db.prepare(`SELECT r.id,r.name,r.kind,r.notes,r.service_ids AS serviceIds,
      r.professional_ids AS professionalIds,r.active,
      (SELECT COUNT(*) FROM appointments a WHERE a.business_id=r.business_id AND a.resource_id=r.id) AS appointmentCount,
      r.created_at AS createdAt,r.updated_at AS updatedAt
      FROM resources r WHERE r.business_id=? ORDER BY r.active DESC,r.name COLLATE NOCASE`)
      .bind(context.businessId).all<ResourceRow>();
    return Response.json({ resources:(result.results ?? []).map(serializeResource), canManage:hasPermission(context.role,"settings.write") }, { headers:{ "cache-control":"no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  return saveResource(request, "create");
}

export async function PUT(request: Request) {
  return saveResource(request, "update");
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await getAdminContext("settings.write");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const body = await readJson<ResourcePayload>(request, 4_096);
    const id = cleanText(body.id, 80);
    if (!id) throw new HttpError(400, "Recurso no válido.");
    const db = await ensureDatabase();
    await enforceRateLimit(db, `resource-write:${context.user.userId}`, 60, 60 * 60 * 1000);
    const resource = await db.prepare(`SELECT r.id,r.name,
      (SELECT COUNT(*) FROM appointments a WHERE a.business_id=r.business_id AND a.resource_id=r.id) AS appointmentCount
      FROM resources r WHERE r.id=? AND r.business_id=?`).bind(id,context.businessId)
      .first<{id:string;name:string;appointmentCount:number}>();
    if (!resource) throw new HttpError(404, "Recurso no encontrado.");
    if (Number(resource.appointmentCount) > 0) throw new HttpError(409, "Este recurso tiene citas y no puede eliminarse. Puedes desactivarlo.");
    await db.prepare("DELETE FROM resources WHERE id=? AND business_id=?").bind(id,context.businessId).run();
    await writeAudit(db,{businessId:context.businessId,user:context.user,action:"resource.deleted",entityType:"resource",entityId:id,metadata:{name:resource.name}});
    return Response.json({id},{headers:{"cache-control":"no-store"}});
  } catch (error) { return errorResponse(error); }
}

async function saveResource(request: Request, mode: "create"|"update") {
  try {
    assertSameOrigin(request);
    const context = await getAdminContext("settings.write");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const body = await readJson<ResourcePayload>(request, 8_192);
    const db = await ensureDatabase();
    await enforceRateLimit(db, `resource-write:${context.user.userId}`, 60, 60 * 60 * 1000);
    const id = mode === "update" ? cleanText(body.id,80) : crypto.randomUUID();
    if (mode === "update" && !id) throw new HttpError(400,"Recurso no válido.");
    const existing = mode === "update" ? await db.prepare("SELECT id,name,kind,notes,service_ids AS serviceIds,professional_ids AS professionalIds,active FROM resources WHERE id=? AND business_id=?").bind(id,context.businessId).first<ResourceRow>() : null;
    if (mode === "update" && !existing) throw new HttpError(404,"Recurso no encontrado.");
    const input = await validateResource(db,context.businessId,body,existing);
    const now = new Date().toISOString();
    try {
      if (mode === "create") {
        await db.prepare(`INSERT INTO resources
          (id,business_id,name,kind,notes,service_ids,professional_ids,active,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id,context.businessId,input.name,input.kind,input.notes,
            JSON.stringify(input.serviceIds),JSON.stringify(input.professionalIds),input.active?1:0,now,now).run();
      } else {
        await db.prepare(`UPDATE resources SET name=?,kind=?,notes=?,service_ids=?,professional_ids=?,active=?,updated_at=?
          WHERE id=? AND business_id=?`).bind(input.name,input.kind,input.notes,JSON.stringify(input.serviceIds),
            JSON.stringify(input.professionalIds),input.active?1:0,now,id,context.businessId).run();
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint")) throw new HttpError(409,"Ya existe un recurso con ese nombre.");
      throw error;
    }
    await writeAudit(db,{businessId:context.businessId,user:context.user,action:mode === "create"?"resource.created":"resource.updated",entityType:"resource",entityId:id,metadata:{kind:input.kind,active:input.active,serviceCount:input.serviceIds.length,professionalCount:input.professionalIds.length}});
    const saved = await findResource(db,context.businessId,id);
    return Response.json({resource:saved ? serializeResource(saved) : null},{status:mode === "create"?201:200,headers:{"cache-control":"no-store"}});
  } catch (error) { return errorResponse(error); }
}

async function validateResource(db: D1Database,businessId:string,body:ResourcePayload,existing:ResourceRow|null) {
  const name = body.name === undefined ? existing?.name ?? "" : cleanText(body.name,100);
  const kind = body.kind === undefined ? existing?.kind ?? "station" : cleanText(body.kind,30);
  const notes = body.notes === undefined ? existing?.notes ?? "" : cleanText(body.notes,300);
  const active = booleanValue(body.active,existing ? existing.active === 1 : true);
  const serviceIds = await resolveIds(db,"services",businessId,body.serviceIds === undefined ? parseIds(existing?.serviceIds) : body.serviceIds,"servicios");
  const professionalIds = await resolveIds(db,"professionals",businessId,body.professionalIds === undefined ? parseIds(existing?.professionalIds) : body.professionalIds,"profesionales");
  if (name.length < 2 || !["station","equipment","room","other"].includes(kind)) throw new HttpError(400,"Revisa el nombre y tipo del recurso.");
  return {name,kind,notes,active,serviceIds,professionalIds};
}

async function resolveIds(db:D1Database,table:"services"|"professionals",businessId:string,value:unknown,label:string) {
  if (!Array.isArray(value)) throw new HttpError(400,`Selecciona ${label} válidos.`);
  const ids = [...new Set(value.map((item)=>cleanText(item,80)).filter(Boolean))];
  if (ids.length > 40) throw new HttpError(400,`Demasiados ${label}.`);
  if (!ids.length) return [];
  const placeholders = ids.map(()=>"?").join(",");
  const rows = await db.prepare(`SELECT id FROM ${table} WHERE business_id=? AND id IN (${placeholders})`).bind(businessId,...ids).all<{id:string}>();
  const found = new Set((rows.results ?? []).map((row)=>row.id));
  if (found.size !== ids.length) throw new HttpError(400,`Hay ${label} que no pertenecen a este negocio.`);
  return ids;
}

async function findResource(db:D1Database,businessId:string,id:string) {
  return db.prepare(`SELECT r.id,r.name,r.kind,r.notes,r.service_ids AS serviceIds,r.professional_ids AS professionalIds,r.active,
    (SELECT COUNT(*) FROM appointments a WHERE a.business_id=r.business_id AND a.resource_id=r.id) AS appointmentCount,
    r.created_at AS createdAt,r.updated_at AS updatedAt FROM resources r WHERE r.id=? AND r.business_id=?`).bind(id,businessId).first<ResourceRow>();
}

function serializeResource(row:ResourceRow) {
  return {...row,serviceIds:parseIds(row.serviceIds),professionalIds:parseIds(row.professionalIds),active:row.active === 1};
}

function parseIds(value:string|undefined|null) {
  if (!value) return [];
  try { const parsed:unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item):item is string=>typeof item === "string") : []; } catch { return []; }
}

function booleanValue(value:unknown,fallback:boolean) {
  if (value === undefined) return fallback;
  if (value === true || value === 1 || value === "1" || value === "true" || value === "on") return true;
  if (value === false || value === 0 || value === "0" || value === "false" || value === "off") return false;
  throw new HttpError(400,"Estado del recurso no válido.");
}
