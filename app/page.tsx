import { redirect } from "next/navigation";
import { getSessionUser } from "./auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSessionUser();
  redirect(user ? (user.mustChangePassword ? "/cambiar-clave" : "/dashboard") : "/login");
}
