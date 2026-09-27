import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { Welcome } from "@/components/auth/Welcome";

export const metadata: Metadata = {
  title: "Welcome — Valiant Movement",
  description: "One Nigeria. One Movement. Join verified Nigerians organising from every ward to the nation.",
};

export default async function WelcomePage() {
  // Signed-in members never see the intro again.
  const user = await getCurrentUser().catch(() => null);
  if (user) redirect("/dashboard");
  return <Welcome />;
}
