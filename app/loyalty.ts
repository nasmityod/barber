/** Acumulación automática de fidelidad: un punto por cada unidad monetaria completa cobrada. */
export async function awardLoyaltyPoints(
  db: D1Database,
  businessId: string,
  clientId: string,
  amountCents: number,
  reason: string,
  actorUserId: string | null,
) {
  const points = Math.floor(amountCents / 100);
  if (points <= 0 || !clientId) return 0;
  const client = await db.prepare("SELECT email FROM clients WHERE id=? AND business_id=?")
    .bind(clientId, businessId).first<{ email:string }>();
  if (!client || client.email.endsWith("@local.invalid")) return 0;
  const now = new Date().toISOString();
  const tier = points >= 500 ? "premium" : points >= 100 ? "frecuente" : "base";
  await db.batch([
    db.prepare(`INSERT INTO loyalty_accounts (id,business_id,client_id,points,tier,updated_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(business_id,client_id) DO UPDATE SET
        points=MAX(0,loyalty_accounts.points+excluded.points),
        tier=CASE WHEN MAX(0,loyalty_accounts.points+excluded.points)>=500 THEN 'premium'
          WHEN MAX(0,loyalty_accounts.points+excluded.points)>=100 THEN 'frecuente' ELSE 'base' END,
        updated_at=excluded.updated_at`)
      .bind(crypto.randomUUID(), businessId, clientId, points, tier, now),
    db.prepare("INSERT INTO loyalty_transactions (id,business_id,client_id,points,reason,created_by,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), businessId, clientId, points, reason, actorUserId, now),
  ]);
  return points;
}
