"use server";

import { getAdminSession } from "@/lib/admin-auth";
import { withRetry } from "@/lib/retry";
import { chapterView, lgaBoard, type ChapterPath, type ChapterView } from "@/lib/associations-db";

/* Chapter membership rollups for the coordinator dashboards, clamped to the
   signed-in coordinator's jurisdiction (a Ward Captain can't peek at another
   state). National sees everything; State/LGA/Ward start pre-scoped. */

export interface ChaptersResult {
  ok: boolean;
  view?: ChapterView;
  /** The fixed prefix the coordinator can't navigate above (their home turf). */
  root?: ChapterPath;
  jurisdiction?: string;
  error?: boolean;
}

export async function getChapters(path: ChapterPath, board?: "lgas"): Promise<ChaptersResult> {
  const admin = await getAdminSession();
  if (!admin) return { ok: false };

  const scope = admin.role.scope;
  // Clamp: any level the coordinator is fixed to overrides the requested path.
  const clamped: ChapterPath = {
    stateName: scope.state ?? path.stateName,
    lgaName: scope.lga ?? path.lgaName,
    ward: scope.ward ?? path.ward,
  };
  const root: ChapterPath = { stateName: scope.state, lgaName: scope.lga, ward: scope.ward };

  try {
    // "LGA & ward units" → a flat performance board of LGAs (scope-clamped to a
    // single state for a State coordinator); otherwise the normal tree level.
    const view =
      board === "lgas"
        ? await withRetry(() => lgaBoard(scope.state ?? path.stateName))
        : await withRetry(() => chapterView(clamped));
    return { ok: true, view, root, jurisdiction: admin.role.jurisdiction };
  } catch (err) {
    console.error("getChapters failed:", err);
    return { ok: false, error: true };
  }
}
