"use server";

import { getCurrentUser } from "@/lib/session";
import * as mem from "@/lib/demo-store";
import type { ProfileDTO, ProfilePatch } from "@/lib/demo-store";

/* ============================================================
   Member profile — read + self-edit. Backed by the in-memory
   store; because getCurrentUser() reads the same store member,
   name changes propagate across the app (sidebar, chat, feed).
   ============================================================ */

export async function getMyProfile(): Promise<ProfileDTO | null> {
  const u = await getCurrentUser();
  if (!u) return null;
  mem.ensureMember(u.id, u.fullName ?? "Member");
  return mem.getProfileDTO(u.id);
}

export async function updateMyProfile(
  patch: ProfilePatch,
): Promise<{ ok: boolean; profile?: ProfileDTO; error?: string }> {
  const u = await getCurrentUser();
  if (!u) return { ok: false, error: "Sign in to edit your profile." };
  mem.ensureMember(u.id, u.fullName ?? "Member");
  const updated = mem.updateProfile(u.id, patch);
  if (!updated) return { ok: false, error: "Could not update profile." };
  return { ok: true, profile: mem.getProfileDTO(u.id)! };
}
