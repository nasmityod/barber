import { destroySession, getSessionUserFromRequest } from "../../../auth";
import { assertSameOrigin, errorResponse, writeAudit } from "../../../security";
import { ensureDatabase } from "../../../../db/init";

export async function POST(request:Request) {
  try {
    assertSameOrigin(request);
    const user = await getSessionUserFromRequest(request);
    const cookie = await destroySession(request);
    if (user) {
      const db = await ensureDatabase();
      await writeAudit(db, { businessId:user.businessId, user, action:"auth.logout", entityType:"auth_session" });
    }
    return new Response(null, { status:303, headers:{ location:"/login", "set-cookie":cookie, "cache-control":"no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
