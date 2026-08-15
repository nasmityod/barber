import { HttpError } from "./security";

export type RedeemedPromotion = {
  id: string;
  name: string;
  code: string;
  kind: string;
  value: number;
  discountCents: number;
};

/**
 * Valida y consume un uso de la promoción de forma atómica.
 * El descuento se calcula sobre `baseCents` y se limita a `maxDiscountCents`.
 * Si la operación posterior falla, revierte el uso con `revertPromotionUse`.
 */
export async function redeemPromotion(
  db: D1Database,
  businessId: string,
  rawCode: string,
  baseCents: number,
  maxDiscountCents: number,
): Promise<RedeemedPromotion> {
  const code = rawCode.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  if (code.length < 2) throw new HttpError(400, "El código promocional no es válido.");
  const today = new Date().toISOString().slice(0, 10);
  const promo = await db.prepare(`SELECT id, name, code, kind, value, max_uses AS maxUses, uses_count AS usesCount
    FROM promotions WHERE business_id = ? AND code = ? AND active = 1 AND starts_at <= ? AND ends_at >= ?`)
    .bind(businessId, code, today, today)
    .first<{ id:string; name:string; code:string; kind:string; value:number; maxUses:number; usesCount:number }>();
  if (!promo) throw new HttpError(404, "El código no existe, está inactivo o fuera de vigencia.");
  if (promo.maxUses > 0 && promo.usesCount >= promo.maxUses) throw new HttpError(409, "El código alcanzó su límite de usos.");
  const discountCents = Math.min(maxDiscountCents,
    promo.kind === "percent" ? Math.round(baseCents * promo.value / 100) : promo.value);
  if (discountCents <= 0) throw new HttpError(409, "El descuento calculado es cero.");
  const guarded = promo.maxUses > 0 ? "AND uses_count < max_uses" : "";
  const redeemed = await db.prepare(`UPDATE promotions SET uses_count = uses_count + 1
    WHERE id = ? AND business_id = ? AND active = 1 ${guarded} RETURNING id`)
    .bind(promo.id, businessId).first<{ id:string }>();
  if (!redeemed) throw new HttpError(409, "El código ya no está disponible.");
  return { id: promo.id, name: promo.name, code: promo.code, kind: promo.kind, value: promo.value, discountCents };
}

export async function revertPromotionUse(db: D1Database, businessId: string, promoId: string) {
  await db.prepare("UPDATE promotions SET uses_count = MAX(0, uses_count - 1) WHERE id = ? AND business_id = ?")
    .bind(promoId, businessId).run();
}
