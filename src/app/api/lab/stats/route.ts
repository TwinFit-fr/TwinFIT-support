import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { listLabGlobalStats, listLabUserStats } from "@/lib/lab/queries";

export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    const [globalStats, userStats] = await Promise.all([
      listLabGlobalStats(token),
      listLabUserStats(token),
    ]);

    const totalSets = globalStats.reduce((sum, row) => sum + Number(row.total_sets), 0);
    const activeWithData = globalStats.filter((row) => row.labExercise?.active).length;

    const byUser = new Map<string, { email: string; total: number }>();
    for (const row of userStats) {
      const email = row.user?.email ?? row.user_id;
      const prev = byUser.get(row.user_id) ?? { email, total: 0 };
      prev.total += Number(row.set_count);
      byUser.set(row.user_id, prev);
    }
    const userTotals = [...byUser.entries()]
      .map(([userId, v]) => ({ userId, email: v.email, totalSets: v.total }))
      .sort((a, b) => b.totalSets - a.totalSets);

    return NextResponse.json({
      ok: true,
      summary: { totalSets, activeWithData, exerciseCount: globalStats.length },
      globalStats,
      userStats,
      userTotals,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Failed to load lab stats";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
