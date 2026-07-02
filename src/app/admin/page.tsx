import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { getAdminSession } from "@/lib/admin-auth";

export const metadata = {
  title: "Admin — Valiant Movement",
};

export default async function AdminPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  return <AdminShell role={session.role} />;
}
