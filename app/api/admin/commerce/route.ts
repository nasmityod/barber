import { ensureDatabase } from "../../../../db/init";
import { awardLoyaltyPoints } from "../../../loyalty";
import { redeemPromotion, revertPromotionUse } from "../../../promotions";
import {
  assertSameOrigin, cleanText, enforceRateLimit, errorResponse, getAdminContext,
  HttpError, readJson, writeAudit,
} from "../../../security";

type CommercePayload = {
  action?: unknown; id?: unknown; productId?: unknown; name?: unknown; sku?: unknown; category?: unknown;
  priceCents?: unknown; costCents?: unknown; stockQuantity?: unknown; minimumStock?: unknown; active?: unknown;
  deltaQuantity?: unknown; type?: unknown; note?: unknown; quantity?: unknown; items?: unknown;
  clientId?: unknown; discountCents?: unknown; tipCents?: unknown; method?: unknown;
  expenseId?: unknown; description?: unknown; vendor?: unknown; amountCents?: unknown;
  receiptNumber?: unknown; notes?: unknown; paymentId?: unknown; saleId?: unknown; reason?: unknown;
  promoCode?: unknown;
};

const METHODS = ["efectivo", "tarjeta", "transferencia", "pago_movil"];
const TYPES = ["entrada", "salida", "ajuste"];

function integer(value: unknown, min = 0, max = 100_000_000) {
  const parsed = typeof value === "number" ? value : Number(cleanText(value, 20));
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function text(value: unknown, max: number) { return cleanText(value, max); }

function commerceError(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("UNIQUE constraint failed: products")) throw new HttpError(409, "Ya existe un producto con ese SKU.");
  throw error;
}

export async function GET() {
  try {
    const context = await getAdminContext("finance.read");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const db = await ensureDatabase();
    const [products, movements, expenses, sales, refunds, payments, summary] = await Promise.all([
      db.prepare(`SELECT id, name, sku, category, price_cents AS priceCents, cost_cents AS costCents,
        stock_quantity AS stockQuantity, minimum_stock AS minimumStock, active, created_at AS createdAt
        FROM products WHERE business_id = ? ORDER BY active DESC, name COLLATE NOCASE`).bind(context.businessId).all(),
      db.prepare(`SELECT movement.id, movement.product_id AS productId, product.name AS productName,
        movement.type, movement.quantity, movement.unit_cost_cents AS unitCostCents, movement.note,
        movement.created_at AS createdAt, member.display_name AS createdByName
        FROM inventory_movements movement JOIN products product ON product.id = movement.product_id
          AND product.business_id = movement.business_id
        LEFT JOIN business_members member ON member.user_id = movement.created_by
          AND member.business_id = movement.business_id
        WHERE movement.business_id = ? ORDER BY movement.created_at DESC LIMIT 80`).bind(context.businessId).all(),
      db.prepare(`SELECT expense.id, expense.category, expense.description, expense.vendor,
        expense.amount_cents AS amountCents, expense.method, expense.receipt_number AS receiptNumber,
        expense.notes, expense.status, expense.created_at AS createdAt, member.display_name AS createdByName
        FROM expenses expense LEFT JOIN business_members member ON member.user_id = expense.created_by
          AND member.business_id = expense.business_id
        WHERE expense.business_id = ? ORDER BY expense.created_at DESC LIMIT 80`).bind(context.businessId).all(),
      db.prepare(`SELECT sale.id, sale.receipt_number AS receiptNumber, sale.subtotal_cents AS subtotalCents,
        sale.discount_cents AS discountCents, sale.total_cents AS totalCents, sale.tip_cents AS tipCents,
        sale.method, sale.status, sale.created_at AS createdAt, client.name AS clientName,
        (SELECT COUNT(*) FROM product_sale_items item WHERE item.sale_id = sale.id AND item.business_id = sale.business_id) AS itemCount
        FROM product_sales sale LEFT JOIN clients client ON client.id = sale.client_id
          AND client.business_id = sale.business_id
        WHERE sale.business_id = ? ORDER BY sale.created_at DESC LIMIT 80`).bind(context.businessId).all(),
      db.prepare(`SELECT refund.id, refund.amount_cents AS amountCents, refund.method, refund.reason,
        refund.payment_id AS paymentId, refund.sale_id AS saleId, refund.created_at AS createdAt,
        COALESCE(client.name, 'Venta POS') AS clientName, COALESCE(service.name, 'Productos') AS itemName
        FROM refunds refund
        LEFT JOIN payments payment ON payment.id = refund.payment_id AND payment.business_id = refund.business_id
        LEFT JOIN appointments appointment ON appointment.id = payment.appointment_id AND appointment.business_id = refund.business_id
        LEFT JOIN clients client ON client.id = appointment.client_id AND client.business_id = refund.business_id
        LEFT JOIN services service ON service.id = appointment.service_id AND service.business_id = refund.business_id
        WHERE refund.business_id = ? ORDER BY refund.created_at DESC LIMIT 80`).bind(context.businessId).all(),
      db.prepare(`SELECT payment.id, payment.appointment_id AS appointmentId, payment.amount_cents AS amountCents,
        payment.tip_cents AS tipCents, payment.method, payment.created_at AS createdAt,
        client.name AS clientName, service.name AS serviceName,
        payment.amount_cents + payment.tip_cents - COALESCE((SELECT SUM(refund.amount_cents) FROM refunds refund
          WHERE refund.payment_id=payment.id AND refund.business_id=payment.business_id AND refund.status='completed'),0) AS refundableCents
        FROM payments payment JOIN appointments appointment ON appointment.id=payment.appointment_id
          AND appointment.business_id=payment.business_id JOIN clients client ON client.id=appointment.client_id
          AND client.business_id=payment.business_id JOIN services service ON service.id=appointment.service_id
          AND service.business_id=payment.business_id WHERE payment.business_id=? AND payment.status='completed'
        ORDER BY payment.created_at DESC LIMIT 80`).bind(context.businessId).all(),
      db.prepare(`SELECT
        COALESCE((SELECT SUM(amount_cents + tip_cents) FROM payments WHERE business_id = ? AND status = 'completed'), 0) AS appointmentIncomeCents,
        COALESCE((SELECT SUM(total_cents + tip_cents) FROM product_sales WHERE business_id = ? AND status = 'completed'), 0) AS productIncomeCents,
        COALESCE((SELECT SUM(tip_cents) FROM payments WHERE business_id = ? AND status = 'completed'), 0) AS appointmentTipsCents,
        COALESCE((SELECT SUM(tip_cents) FROM product_sales WHERE business_id = ? AND status = 'completed'), 0) AS productTipsCents,
        COALESCE((SELECT SUM(amount_cents) FROM expenses WHERE business_id = ? AND status = 'completed'), 0) AS expenseCents,
        COALESCE((SELECT SUM(amount_cents) FROM refunds WHERE business_id = ? AND status = 'completed'), 0) AS refundCents`).bind(
          context.businessId, context.businessId, context.businessId, context.businessId,
          context.businessId, context.businessId,
        ).first(),
    ]);
    return Response.json({
      products: products.results ?? [], movements: movements.results ?? [], expenses: expenses.results ?? [],
      sales: sales.results ?? [], refunds: refunds.results ?? [], payments: payments.results ?? [], summary: summary ?? {},
      canManage: context.role === "owner" || context.role === "admin",
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await getAdminContext("finance.write");
    if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
    const body = await readJson<CommercePayload>(request, 16_384);
    const action = text(body.action, 32);
    const db = await ensureDatabase();
    await enforceRateLimit(db, `commerce-write:${context.user.userId}`, 60, 60_000);
    if (action === "product") return await createProduct(db, context, body);
    if (action === "product_update") return await updateProduct(db, context, body);
    if (action === "inventory") return await adjustInventory(db, context, body);
    if (action === "sale") return await createSale(db, context, body);
    if (action === "expense") return await createExpense(db, context, body);
    if (action === "refund") return await createRefund(db, context, body);
    throw new HttpError(400, "Acción comercial no válida.");
  } catch (error) {
    try { commerceError(error); } catch (nested) { return errorResponse(nested); }
    return errorResponse(error);
  }
}

async function openSession(db: D1Database, businessId: string) {
  const session = await db.prepare("SELECT id FROM cash_sessions WHERE business_id = ? AND status = 'open'")
    .bind(businessId).first<{ id: string }>();
  if (!session) throw new HttpError(409, "Abre la caja antes de registrar esta operación.");
  return session.id;
}

async function createProduct(db: D1Database, context: Awaited<ReturnType<typeof getAdminContext>>, body: CommercePayload) {
  if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
  const name = text(body.name, 100); const sku = text(body.sku, 40); const category = text(body.category, 60) || "General";
  const priceCents = integer(body.priceCents, 1); const costCents = integer(body.costCents, 0) ?? 0;
  const stockQuantity = integer(body.stockQuantity, 0, 1_000_000) ?? 0; const minimumStock = integer(body.minimumStock, 0, 1_000_000) ?? 0;
  if (name.length < 2 || priceCents === null || costCents === null || stockQuantity === null || minimumStock === null) throw new HttpError(400, "Revisa los datos del producto.");
  const id = crypto.randomUUID(); const createdAt = new Date().toISOString();
  try {
    await db.batch([
      db.prepare(`INSERT INTO products (id,business_id,name,sku,category,price_cents,cost_cents,stock_quantity,minimum_stock,active,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,1,?)`).bind(id, context.businessId, name, sku, category, priceCents, costCents, stockQuantity, minimumStock, createdAt),
      ...(stockQuantity > 0 ? [db.prepare(`INSERT INTO inventory_movements
        (id,business_id,product_id,type,quantity,unit_cost_cents,note,created_by,created_at)
        VALUES (?,?,?,'entrada',?,?,? ,?,?)`).bind(crypto.randomUUID(), context.businessId, id, stockQuantity, costCents, "Inventario inicial", context.user.userId, createdAt)] : []),
    ]);
  } catch (error) { commerceError(error); }
  await writeAudit(db, { businessId: context.businessId, user: context.user, action: "product.created", entityType: "product", entityId: id, metadata: { stockQuantity, priceCents } });
  return Response.json({ id }, { status: 201, headers: { "cache-control": "no-store" } });
}

async function updateProduct(db: D1Database, context: Awaited<ReturnType<typeof getAdminContext>>, body: CommercePayload) {
  if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
  const id = text(body.id, 80); const name = text(body.name, 100); const sku = text(body.sku, 40); const category = text(body.category, 60) || "General";
  const priceCents = integer(body.priceCents, 1); const costCents = integer(body.costCents, 0); const minimumStock = integer(body.minimumStock, 0, 1_000_000);
  if (!id || name.length < 2 || priceCents === null || costCents === null || minimumStock === null) throw new HttpError(400, "Revisa los datos del producto.");
  const result = await db.prepare(`UPDATE products SET name=?,sku=?,category=?,price_cents=?,cost_cents=?,minimum_stock=?,active=?
    WHERE id=? AND business_id=?`).bind(name, sku, category, priceCents, costCents, minimumStock, body.active === false ? 0 : 1, id, context.businessId).run();
  if (!result.meta.changes) throw new HttpError(404, "Producto no encontrado.");
  await writeAudit(db, { businessId: context.businessId, user: context.user, action: "product.updated", entityType: "product", entityId: id });
  return Response.json({ id }, { headers: { "cache-control": "no-store" } });
}

async function adjustInventory(db: D1Database, context: Awaited<ReturnType<typeof getAdminContext>>, body: CommercePayload) {
  if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
  const productId = text(body.productId, 80); const delta = integer(body.deltaQuantity, -1_000_000, 1_000_000);
  const type = text(body.type, 20); const note = text(body.note, 300);
  if (!productId || delta === null || delta === 0 || !TYPES.includes(type)) throw new HttpError(400, "Indica un ajuste de inventario válido.");
  const product = await db.prepare("SELECT stock_quantity AS stockQuantity, cost_cents AS costCents FROM products WHERE id=? AND business_id=?")
    .bind(productId, context.businessId).first<{ stockQuantity:number; costCents:number }>();
  if (!product) throw new HttpError(404, "Producto no encontrado.");
  const quantity = type === "ajuste" ? delta - product.stockQuantity : type === "salida" ? -Math.abs(delta) : Math.abs(delta);
  const next = product.stockQuantity + quantity;
  if (next < 0) throw new HttpError(409, "El inventario no puede quedar en negativo.");
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE products SET stock_quantity=? WHERE id=? AND business_id=?").bind(next, productId, context.businessId),
    db.prepare(`INSERT INTO inventory_movements (id,business_id,product_id,type,quantity,unit_cost_cents,note,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), context.businessId, productId, type, quantity, product.costCents, note, context.user.userId, now),
  ]);
  await writeAudit(db, { businessId: context.businessId, user: context.user, action: "inventory.adjusted", entityType: "product", entityId: productId, metadata: { quantity, type } });
  return Response.json({ id: productId, stockQuantity: next }, { headers: { "cache-control": "no-store" } });
}

async function createSale(db: D1Database, context: Awaited<ReturnType<typeof getAdminContext>>, body: CommercePayload) {
  if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
  const sessionId = await openSession(db, context.businessId);
  if (!Array.isArray(body.items) || !body.items.length || !METHODS.includes(text(body.method, 24))) throw new HttpError(400, "Agrega productos y un método de pago.");
  const rawItems = body.items.map((item) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return { productId: text(row.productId, 80), quantity: integer(row.quantity, 1, 1_000) };
  });
  if (rawItems.some((item) => !item.productId || item.quantity === null)) throw new HttpError(400, "La venta contiene productos inválidos.");
  const requested = [...rawItems.reduce((map, item) => map.set(item.productId, (map.get(item.productId) ?? 0) + item.quantity!), new Map<string, number>())]
    .map(([productId, quantity]) => ({ productId, quantity }));
  const products = [] as { id:string;name:string;priceCents:number;stockQuantity:number }[];
  for (const item of requested) {
    const product = await db.prepare("SELECT id,name,price_cents AS priceCents,stock_quantity AS stockQuantity FROM products WHERE id=? AND business_id=? AND active=1")
      .bind(item.productId, context.businessId).first<{id:string;name:string;priceCents:number;stockQuantity:number}>();
    if (!product) throw new HttpError(404, "Uno de los productos ya no está disponible.");
    if (product.stockQuantity < item.quantity!) throw new HttpError(409, `Stock insuficiente para ${product.name}.`);
    products.push(product);
  }
  const subtotalCents = requested.reduce((sum, item, index) => sum + products[index].priceCents * item.quantity!, 0);
  let discountCents = integer(body.discountCents, 0, subtotalCents) ?? 0;
  const promoCode = text(body.promoCode, 32);
  let promo: Awaited<ReturnType<typeof redeemPromotion>> | null = null;
  if (promoCode) {
    promo = await redeemPromotion(db, context.businessId, promoCode, subtotalCents, subtotalCents - discountCents);
    discountCents += promo.discountCents;
  }
  const tipCents = integer(body.tipCents, 0, 100_000_000) ?? 0;
  const totalCents = subtotalCents - discountCents; const id = crypto.randomUUID(); const now = new Date().toISOString();
  const receiptNumber = `V-${now.slice(0,10).replaceAll("-", "")}-${id.slice(0,6).toUpperCase()}`;
  const clientId = text(body.clientId, 80) || null;
  const statements: D1PreparedStatement[] = [db.prepare(`INSERT INTO product_sales
    (id,business_id,cash_session_id,client_id,subtotal_cents,discount_cents,total_cents,tip_cents,method,status,receipt_number,created_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,'completed',?,?,?)`).bind(id, context.businessId, sessionId, clientId,
      subtotalCents, discountCents, totalCents, tipCents, text(body.method, 24), receiptNumber, context.user.userId, now)];
  requested.forEach((item, index) => {
    const product = products[index]; const quantity = item.quantity!; const lineTotalCents = product.priceCents * quantity;
    statements.push(db.prepare(`INSERT INTO product_sale_items
      (id,business_id,sale_id,product_id,product_name,quantity,unit_price_cents,line_total_cents) VALUES (?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), context.businessId, id, product.id, product.name, quantity, product.priceCents, lineTotalCents));
    statements.push(db.prepare("UPDATE products SET stock_quantity=stock_quantity-? WHERE id=? AND business_id=? AND stock_quantity>=?")
      .bind(quantity, product.id, context.businessId, quantity));
    statements.push(db.prepare(`INSERT INTO inventory_movements
      (id,business_id,product_id,type,quantity,unit_cost_cents,note,reference_id,created_by,created_at)
      VALUES (?,?,?,'salida',?,?,?,?,?,?)`).bind(crypto.randomUUID(), context.businessId, product.id, -quantity, 0, "Venta POS", id, context.user.userId, now));
  });
  statements.push(db.prepare(`INSERT INTO receipts (id,business_id,receipt_number,sale_id,snapshot,created_at)
    VALUES (?,?,?,?,?,?)`).bind(crypto.randomUUID(), context.businessId, receiptNumber, id, JSON.stringify({ saleId:id, receiptNumber }), now));
  try {
    await db.batch(statements);
  } catch (error) {
    if (promo) await revertPromotionUse(db, context.businessId, promo.id);
    throw error;
  }
  await writeAudit(db, { businessId: context.businessId, user: context.user, action: "sale.created", entityType: "product_sale", entityId: id, metadata: { totalCents, tipCents, ...(promo ? { promoCode: promo.code, promoDiscountCents: promo.discountCents } : {}) } });
  if (clientId) await awardLoyaltyPoints(db, context.businessId, clientId, totalCents, "Puntos por compra en tienda", context.user.userId);
  return Response.json({ id, receiptNumber, totalCents, tipCents, promoDiscountCents: promo?.discountCents ?? 0 }, { status: 201, headers: { "cache-control": "no-store" } });
}

async function createExpense(db: D1Database, context: Awaited<ReturnType<typeof getAdminContext>>, body: CommercePayload) {
  if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
  const sessionId = await openSession(db, context.businessId); const category = text(body.category, 60); const description = text(body.description, 180);
  const amountCents = integer(body.amountCents, 1); const method = text(body.method, 24);
  if (!category || !description || amountCents === null || !METHODS.includes(method)) throw new HttpError(400, "Revisa los datos del gasto.");
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await db.prepare(`INSERT INTO expenses (id,business_id,cash_session_id,category,description,vendor,amount_cents,method,receipt_number,notes,created_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, context.businessId, sessionId, category, description, text(body.vendor, 120), amountCents, method, text(body.receiptNumber, 80), text(body.notes, 500), context.user.userId, now).run();
  await writeAudit(db, { businessId: context.businessId, user: context.user, action: "expense.created", entityType: "expense", entityId: id, metadata: { amountCents, method, category } });
  return Response.json({ id }, { status: 201, headers: { "cache-control": "no-store" } });
}

async function createRefund(db: D1Database, context: Awaited<ReturnType<typeof getAdminContext>>, body: CommercePayload) {
  if (!context) throw new HttpError(401, "Inicia sesión para continuar.");
  const sessionId = await openSession(db, context.businessId); const paymentId = text(body.paymentId, 80); const saleId = text(body.saleId, 80);
  const amountCents = integer(body.amountCents, 1); const reason = text(body.reason, 240);
  if ((!paymentId && !saleId) || (paymentId && saleId) || amountCents === null || !reason) throw new HttpError(400, "Indica una venta y un motivo para el reembolso.");
  let method = "efectivo"; let refundable = 0; let appointmentId = "";
  if (paymentId) {
    const payment = await db.prepare(`SELECT appointment_id AS appointmentId, amount_cents AS amountCents, tip_cents AS tipCents, method FROM payments
      WHERE id=? AND business_id=? AND status='completed'`).bind(paymentId, context.businessId).first<{appointmentId:string;amountCents:number;tipCents:number;method:string}>();
    if (!payment) throw new HttpError(404, "Cobro no encontrado.");
    method = payment.method; appointmentId = payment.appointmentId; refundable = payment.amountCents + payment.tipCents;
    const used = await db.prepare("SELECT COALESCE(SUM(amount_cents),0) AS amount FROM refunds WHERE payment_id=? AND business_id=? AND status='completed'").bind(paymentId, context.businessId).first<{amount:number}>();
    refundable -= used?.amount ?? 0;
  } else {
    const sale = await db.prepare("SELECT total_cents AS totalCents, tip_cents AS tipCents, method FROM product_sales WHERE id=? AND business_id=? AND status='completed'").bind(saleId, context.businessId).first<{totalCents:number;tipCents:number;method:string}>();
    if (!sale) throw new HttpError(404, "Venta POS no encontrada.");
    method = sale.method; refundable = sale.totalCents + sale.tipCents;
    const used = await db.prepare("SELECT COALESCE(SUM(amount_cents),0) AS amount FROM refunds WHERE sale_id=? AND business_id=? AND status='completed'").bind(saleId, context.businessId).first<{amount:number}>();
    refundable -= used?.amount ?? 0;
  }
  if (amountCents > refundable) throw new HttpError(409, "El reembolso supera el saldo disponible.");
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await db.prepare(`INSERT INTO refunds (id,business_id,cash_session_id,payment_id,sale_id,amount_cents,method,reason,created_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id, context.businessId, sessionId, paymentId || null, saleId || null, amountCents, method, reason, context.user.userId, now).run();
  await writeAudit(db, { businessId: context.businessId, user: context.user, action: "refund.created", entityType: "refund", entityId: id, metadata: { amountCents, method, paymentId: paymentId || null, saleId: saleId || null } });
  const paidCents = appointmentId ? (await db.prepare(`SELECT MAX(0, COALESCE((SELECT SUM(amount_cents) FROM payments
    WHERE appointment_id=? AND business_id=? AND status='completed'),0) - COALESCE((SELECT SUM(amount_cents) FROM refunds
    WHERE payment_id IN (SELECT id FROM payments WHERE appointment_id=? AND business_id=?) AND business_id=? AND status='completed'),0)) AS paidCents`)
    .bind(appointmentId, context.businessId, appointmentId, context.businessId, context.businessId).first<{paidCents:number}>())?.paidCents ?? 0 : null;
  return Response.json({ id, amountCents, method, appointmentId: appointmentId || null, paidCents }, { status: 201, headers: { "cache-control": "no-store" } });
}
