import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
    try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;

    const admin = createAdminClient();

    const [
        merchantsTotal,
        merchantsActive,
        merchantsPending,
        merchantsSuspended,
        consumers,
        products,
        promotionsActive,
        recentMerchants,
        merchantTimeline,
    ] = await Promise.all([
        admin.from("merchants").select("*", { count: "exact", head: true }),
        admin.from("merchants").select("*", { count: "exact", head: true }).eq("status", "active"),
        admin.from("merchants").select("*", { count: "exact", head: true }).eq("status", "pending"),
        admin.from("merchants").select("*", { count: "exact", head: true }).eq("status", "suspended"),
        admin.from("consumer_profiles").select("*", { count: "exact", head: true }),
        admin.from("products").select("*", { count: "exact", head: true }),
        admin
            .from("promotions")
            .select("*", { count: "exact", head: true })
            .or("ends_at.is.null,ends_at.gt.now()"),
        // 10 derniers marchands inscrits
        admin
            .from("merchants")
            .select("id, name, city, status, created_at")
            .order("created_at", { ascending: false })
            .limit(10),
        // Tous les marchands avec date de création pour timeline
        admin
            .from("merchants")
            .select("created_at, status"),
    ]);

    // Build timeline: group merchants by month
    const timeline: Record<string, { month: string; total: number; active: number; pending: number }> = {};
    if (merchantTimeline.data) {
        for (const m of merchantTimeline.data) {
            const date = new Date(m.created_at);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
            if (!timeline[key]) {
                timeline[key] = { month: key, total: 0, active: 0, pending: 0 };
            }
            timeline[key].total++;
            if (m.status === "active") timeline[key].active++;
            else if (m.status === "pending") timeline[key].pending++;
        }
    }

    const sortedTimeline = Object.values(timeline).sort((a, b) => a.month.localeCompare(b.month));

    return NextResponse.json({
        total_merchants: merchantsTotal.count ?? 0,
        merchants_active: merchantsActive.count ?? 0,
        merchants_pending: merchantsPending.count ?? 0,
        merchants_suspended: merchantsSuspended.count ?? 0,
        total_consumers: consumers.count ?? 0,
        total_products: products.count ?? 0,
        total_promotions_active: promotionsActive.count ?? 0,
        recent_merchants: recentMerchants.data ?? [],
        timeline: sortedTimeline,
    });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
