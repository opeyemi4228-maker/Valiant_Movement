import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { MemberShell } from "@/components/community/MemberShell";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <MemberShell
      user={{
        fullName: user.fullName,
        email: user.email,
        status: user.status,
        avatarUrl: user.avatarUrl,
      }}
    />
  );
}
