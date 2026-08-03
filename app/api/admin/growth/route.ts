import { ensureDatabase } from "../../../../db/init";
import { assertSameOrigin, cleanText, enforceRateLimit, errorResponse, getAdminContext, HttpError, isDate, isEmail, isPhone, readJson, writeAudit } from "../../../security";

type Input = Record<string, unknown>;

export async function GET() {
  try {
    const context = await getAdminContext("clients.read");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const db = await ensureDatabase();
    const [clients, promotions, loyalty, reviews, gallery, waitlist, messages, paymentRequests] = await Promise.all([
      db.prepare("SELECT id,name,email,phone FROM clients WHERE business_id=? ORDER BY name COLLATE NOCASE").bind(context.businessId).all(),
      db.prepare("SELECT id,name,code,kind,value,active,starts_at AS startsAt,ends_at AS endsAt,max_uses AS maxUses,uses_count AS usesCount FROM promotions WHERE business_id = ? ORDER BY created_at DESC").bind(context.businessId).all(),
      db.prepare(`SELECT a.id,a.client_id AS clientId,a.points,a.tier,a.updated_at AS updatedAt,c.name AS clientName,c.email,c.phone
        FROM loyalty_accounts a JOIN clients c ON c.id=a.client_id AND c.business_id=a.business_id WHERE a.business_id=? ORDER BY a.points DESC`).bind(context.businessId).all(),
      db.prepare(`SELECT r.id,r.rating,r.comment,r.status,r.created_at AS createdAt,r.published_at AS publishedAt,c.name AS clientName,c.email
        FROM reviews r LEFT JOIN clients c ON c.id=r.client_id AND c.business_id=r.business_id WHERE r.business_id=? ORDER BY r.created_at DESC`).bind(context.businessId).all(),
      db.prepare("SELECT id,title,image_url AS imageUrl,caption,active,sort_order AS sortOrder,created_at AS createdAt FROM gallery_items WHERE business_id=? ORDER BY sort_order,created_at DESC").bind(context.businessId).all(),
      db.prepare(`SELECT w.id,w.client_id AS clientId,w.name,w.email,w.phone,w.preferred_date AS preferredDate,w.preferred_time AS preferredTime,w.status,w.notes,w.created_at AS createdAt,s.name AS serviceName,p.name AS professionalName
        FROM waitlist_entries w LEFT JOIN services s ON s.id=w.service_id AND s.business_id=w.business_id LEFT JOIN professionals p ON p.id=w.professional_id AND p.business_id=w.business_id WHERE w.business_id=? ORDER BY CASE w.status WHEN 'waiting' THEN 0 ELSE 1 END,w.created_at`).bind(context.businessId).all(),
      db.prepare("SELECT id,channel,kind,recipient,body,status,scheduled_at AS scheduledAt,sent_at AS sentAt,error,created_at AS createdAt FROM message_logs WHERE business_id=? ORDER BY created_at DESC LIMIT 100").bind(context.businessId).all(),
      db.prepare(`SELECT p.id,p.appointment_id AS appointmentId,p.client_id AS clientId,p.amount_cents AS amountCents,p.deposit_cents AS depositCents,p.method,p.provider,p.checkout_url AS checkoutUrl,p.reference,p.status,p.token,p.expires_at AS expiresAt,p.created_at AS createdAt,c.name AS clientName
        FROM payment_requests p LEFT JOIN clients c ON c.id=p.client_id AND c.business_id=p.business_id WHERE p.business_id=? ORDER BY p.created_at DESC LIMIT 100`).bind(context.businessId).all(),
    ]);
    return Response.json({ clients: clients.results ?? [], promotions: promotions.results ?? [], loyalty: loyalty.results ?? [], reviews: reviews.results ?? [], gallery: gallery.results ?? [], waitlist: waitlist.results ?? [], messages: messages.results ?? [], paymentRequests: paymentRequests.results ?? [], canManage: context.role !== "professional" });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = await readJson<Input>(request, 32_768);
    const action = cleanText(input.action, 40);
    const context = await getAdminContext(action.startsWith("payment_") ? "finance.write" : "clients.write");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const db = await ensureDatabase();
    await enforceRateLimit(db, `growth-write:${context.user.userId}`, 120, 60 * 1000);
    const now = new Date().toISOString();

    if (action === "promotion_create" || action === "promotion_update") {
      const name = cleanText(input.name, 120); const code = cleanText(input.code, 32).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
      const kind = input.kind === "fixed" ? "fixed" : "percent"; const value = integer(input.value);
      const startsAt = cleanText(input.startsAt, 20); const endsAt = cleanText(input.endsAt, 20); const id = cleanText(input.id, 80) || crypto.randomUUID();
      if (name.length < 2 || code.length < 2 || value <= 0 || (kind === "percent" && value > 100) || !isDate(startsAt) || !isDate(endsAt) || startsAt > endsAt) throw new HttpError(400, "Revisa los datos de la promoción.");
      await db.prepare(`INSERT INTO promotions (id,business_id,name,code,kind,value,active,starts_at,ends_at,max_uses,uses_count,created_at)
        VALUES (?,?,?,?,?,?,1,?,?,?,0,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,code=excluded.code,kind=excluded.kind,value=excluded.value,starts_at=excluded.starts_at,ends_at=excluded.ends_at,max_uses=excluded.max_uses`).bind(id, context.businessId, name, code, kind, value, startsAt, endsAt, Math.max(0, integer(input.maxUses)), now).run();
      await writeAudit(db, { businessId: context.businessId, user: context.user, action: action === "promotion_create" ? "promotion.created" : "promotion.updated", entityType: "promotion", entityId: id });
      return Response.json({ id });
    }
    if (action === "promotion_toggle") {
      const id = cleanText(input.id, 80); await db.prepare("UPDATE promotions SET active = CASE WHEN active=1 THEN 0 ELSE 1 END WHERE id=? AND business_id=?").bind(id, context.businessId).run(); return Response.json({ id });
    }
    if (action === "loyalty_adjust") {
      const clientId = cleanText(input.clientId, 80); const points = integer(input.points, true); const reason = cleanText(input.reason, 160);
      const client = await db.prepare("SELECT id FROM clients WHERE id=? AND business_id=?").bind(clientId, context.businessId).first();
      if (!client || !reason || points === 0) throw new HttpError(400, "Selecciona un cliente, puntos distintos de cero y un motivo.");
      const accountId = crypto.randomUUID();
      await db.prepare(`INSERT INTO loyalty_accounts (id,business_id,client_id,points,tier,updated_at) VALUES (?,?,?,?,?,?)
        ON CONFLICT(business_id,client_id) DO UPDATE SET points=MAX(0,loyalty_accounts.points+excluded.points),tier=CASE WHEN MAX(0,loyalty_accounts.points+excluded.points)>=500 THEN 'premium' WHEN MAX(0,loyalty_accounts.points+excluded.points)>=100 THEN 'frecuente' ELSE 'base' END,updated_at=excluded.updated_at`).bind(accountId, context.businessId, clientId, points, tierFor(points), now).run();
      await db.prepare("INSERT INTO loyalty_transactions (id,business_id,client_id,points,reason,created_by,created_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(), context.businessId, clientId, points, reason, context.user.userId, now).run();
      return Response.json({ clientId, points });
    }
    if (action === "review_status") {
      const id = cleanText(input.id, 80); const status = ["pending", "published", "hidden"].includes(String(input.status)) ? String(input.status) : "pending";
      await db.prepare("UPDATE reviews SET status=?,published_at=CASE WHEN ?='published' THEN COALESCE(published_at,?) ELSE published_at END WHERE id=? AND business_id=?").bind(status, status, now, id, context.businessId).run(); return Response.json({ id, status });
    }
    if (action === "review_create") {
      const rating = integer(input.rating); const comment = cleanText(input.comment, 800); const clientId = cleanText(input.clientId, 80) || null;
      if (rating < 1 || rating > 5 || !comment) throw new HttpError(400, "La reseña necesita una valoración y comentario.");
      const id = crypto.randomUUID(); await db.prepare("INSERT INTO reviews (id,business_id,client_id,rating,comment,status,token,created_at) VALUES (?,?,?,?,?,'published',?,?,?)").bind(id, context.businessId, clientId, rating, comment, crypto.randomUUID(), now, now).run(); return Response.json({ id });
    }
    if (action === "gallery_create" || action === "gallery_update") {
      const id = cleanText(input.id, 80) || crypto.randomUUID(); const title = cleanText(input.title, 100); const imageUrl = cleanText(input.imageUrl, 500); const caption = cleanText(input.caption, 300);
      if (!title || !/^https?:\/\//u.test(imageUrl)) throw new HttpError(400, "Añade un título y una URL de imagen válida.");
      await db.prepare(`INSERT INTO gallery_items (id,business_id,title,image_url,caption,active,sort_order,created_at) VALUES (?,?,?,?,?,1,?,?)
        ON CONFLICT(id) DO UPDATE SET title=excluded.title,image_url=excluded.image_url,caption=excluded.caption,sort_order=excluded.sort_order`).bind(id, context.businessId, title, imageUrl, caption, integer(input.sortOrder), now).run(); return Response.json({ id });
    }
    if (action === "gallery_toggle") { const id=cleanText(input.id,80); await db.prepare("UPDATE gallery_items SET active=CASE WHEN active=1 THEN 0 ELSE 1 END WHERE id=? AND business_id=?").bind(id,context.businessId).run(); return Response.json({id}); }
    if (action === "gallery_delete") { const id=cleanText(input.id,80); await db.prepare("DELETE FROM gallery_items WHERE id=? AND business_id=?").bind(id,context.businessId).run(); return Response.json({id}); }
    if (action === "waitlist_create") {
      const name=cleanText(input.name,100); const email=cleanText(input.email,254); const phone=cleanText(input.phone,25); if(name.length<2||(!email&&!phone)||(email&&!isEmail(email))||(phone&&!isPhone(phone))) throw new HttpError(400,"Revisa el nombre, email o teléfono.");
      const id=crypto.randomUUID(); await db.prepare("INSERT INTO waitlist_entries (id,business_id,name,email,phone,service_id,professional_id,preferred_date,preferred_time,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'waiting',?,?,?)").bind(id,context.businessId,name,email,phone,cleanText(input.serviceId,80)||null,cleanText(input.professionalId,80)||null,cleanText(input.preferredDate,20),cleanText(input.preferredTime,20),cleanText(input.notes,500),now,now).run(); return Response.json({id});
    }
    if (action === "waitlist_status") { const id=cleanText(input.id,80); const status=["waiting","contacted","booked","closed"].includes(String(input.status))?String(input.status):"waiting"; await db.prepare("UPDATE waitlist_entries SET status=?,updated_at=? WHERE id=? AND business_id=?").bind(status,now,id,context.businessId).run(); return Response.json({id,status}); }
    if (action === "reminder_run") {
      const target = cleanText(input.date, 20) || new Intl.DateTimeFormat("en-CA", { timeZone: context.timezone, year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date(Date.now()+86_400_000));
      if (!isDate(target)) throw new HttpError(400,"Fecha de recordatorio no válida.");
      const appointments = await db.prepare(`SELECT a.id,a.client_id AS clientId,a.appointment_date AS date,a.start_time AS time,c.name,c.email,c.phone,s.name AS serviceName
        FROM appointments a JOIN clients c ON c.id=a.client_id AND c.business_id=a.business_id JOIN services s ON s.id=a.service_id AND s.business_id=a.business_id
        WHERE a.business_id=? AND a.appointment_date=? AND a.status IN ('programada','confirmada')`).bind(context.businessId,target).all();
      let queued=0; for(const appointment of appointments.results??[]){ const body=`Hola ${appointment.name}, te recordamos tu cita de ${appointment.serviceName} el ${appointment.date} a las ${appointment.time}.`; for(const [channel,recipient] of [["whatsapp",appointment.phone],["email",appointment.email]] as const){ if(!recipient||String(recipient).includes("@local.invalid"))continue; const exists=await db.prepare("SELECT id FROM message_logs WHERE business_id=? AND appointment_id=? AND kind='appointment_reminder' AND channel=? AND scheduled_at=?").bind(context.businessId,appointment.id,channel,target).first(); if(exists)continue; await db.prepare("INSERT INTO message_logs (id,business_id,client_id,appointment_id,channel,kind,recipient,body,status,scheduled_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),context.businessId,appointment.clientId,appointment.id,channel,"appointment_reminder",recipient,body,"queued",target,now).run(); queued++; } }
      return Response.json({queued,date:target});
    }
    if (action === "message_queue") {
      const clientId=cleanText(input.clientId,80); const channel=input.channel==="email"?"email":"whatsapp"; const recipient=cleanText(input.recipient,254); const body=cleanText(input.body,1000); if(!body||!recipient)throw new HttpError(400,"El mensaje necesita destinatario y contenido."); if(channel==="email"&&!isEmail(recipient)||channel==="whatsapp"&&!isPhone(recipient))throw new HttpError(400,"El destinatario no es válido."); const id=crypto.randomUUID(); await db.prepare("INSERT INTO message_logs (id,business_id,client_id,channel,kind,recipient,body,status,scheduled_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id,context.businessId,clientId||null,channel,"manual",recipient,body,"queued",now,now).run(); return Response.json({id});
    }
    if (action === "payment_request") {
      const appointmentId=cleanText(input.appointmentId,80)||null; const clientId=cleanText(input.clientId,80)||null; const amountCents=integer(input.amountCents); const depositCents=integer(input.depositCents); const checkoutUrl=cleanText(input.checkoutUrl,500); const provider=["manual","stripe","mercadopago","paypal"].includes(String(input.provider))?String(input.provider):"manual";
      if(amountCents<=0||depositCents<=0||depositCents>amountCents)throw new HttpError(400,"El depósito debe ser mayor que cero y no superar el total."); if(checkoutUrl&&!/^https?:\/\//u.test(checkoutUrl))throw new HttpError(400,"El enlace de pago no es válido.");
      if (appointmentId) { const appointment=await db.prepare("SELECT total_cents AS totalCents,client_id AS clientId FROM appointments WHERE id=? AND business_id=?").bind(appointmentId,context.businessId).first<{totalCents:number;clientId:string}>(); if(!appointment)throw new HttpError(404,"La cita no pertenece a este negocio."); if(amountCents!==appointment.totalCents)throw new HttpError(400,"El total no coincide con la cita seleccionada."); }
      if (clientId) { const client=await db.prepare("SELECT id FROM clients WHERE id=? AND business_id=?").bind(clientId,context.businessId).first(); if(!client)throw new HttpError(404,"El cliente no pertenece a este negocio."); }
      const id=crypto.randomUUID(); const token=crypto.randomUUID().replaceAll("-",""); const expires=new Date(Date.now()+7*86_400_000).toISOString(); await db.prepare("INSERT INTO payment_requests (id,business_id,appointment_id,client_id,amount_cents,deposit_cents,method,provider,checkout_url,status,token,expires_at,created_at) VALUES (?,?,?,?,?,?,?,? ,?,'pending',?,?,?)").bind(id,context.businessId,appointmentId,clientId,amountCents,depositCents,cleanText(input.method,30)||"deposit",provider,checkoutUrl,token,expires,now).run(); return Response.json({id,token});
    }
    if (action === "payment_status") { const id=cleanText(input.id,80); const status=["pending","submitted","paid","expired","cancelled"].includes(String(input.status))?String(input.status):"pending"; await db.prepare("UPDATE payment_requests SET status=?,paid_at=CASE WHEN ?='paid' THEN COALESCE(paid_at,?) ELSE paid_at END,reference=? WHERE id=? AND business_id=?").bind(status,status,now,cleanText(input.reference,120),id,context.businessId).run(); return Response.json({id,status}); }
    throw new HttpError(400, "Operación no reconocida.");
  } catch (error) { return errorResponse(error); }
}

function integer(value: unknown, signed = false) { const number = Number(value); if (!Number.isSafeInteger(number) || (!signed && number < 0)) return 0; return number; }
function tierFor(points: number) { return points >= 500 ? "premium" : points >= 100 ? "frecuente" : "base"; }
