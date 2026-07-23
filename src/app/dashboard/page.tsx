import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { MemberShell } from "@/components/community/MemberShell";
import { Reconnecting, ConnectionError } from "./reconnect";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ reconnect?: string }>;
}) {
  const { reconnect } = await searchParams;
  const attempt = Number(reconnect) || 0;

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    // Transient DB failure (e.g. a Neon cold-start beyond the retry budget).
    // Never crash and never log the member out — self-heal by reloading, and
    // fall through to a manual retry after a few attempts so a real outage
    // doesn't reload forever.
    if (attempt < 3) return <Reconnecting next={`/dashboard?reconnect=${attempt + 1}`} />;
    return <ConnectionError />;
  }

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
