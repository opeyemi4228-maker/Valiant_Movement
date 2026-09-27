import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  // First visit → the welcome slides; after that, straight to sign-in.
  const welcomed = (await cookies()).get("vm_welcomed");
  redirect(welcomed ? "/login" : "/welcome");
}
