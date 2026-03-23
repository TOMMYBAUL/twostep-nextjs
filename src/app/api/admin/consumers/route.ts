import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
    try {
        const auth = await requireAdmin();
        if ("error" in auth) return auth.error;

        const { searchParams } = request.nextUrl;
        const page = Math.max(1, Number(searchParams.get("page")) || 1);
        const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 20));

        const from = (page - 1) * limit;
        const to = from + limit - 1;

        const admin = createAdminClient();

        const { data, count, error } = await admin
            .from("consumer_profiles")
            .select("id, user_id, default_lat, default_lng, default_radius_km, created_at", { count: "exact" })
            .order("created_at", { ascending: false })
            .range(from, to);

        if (error) {
            return NextResponse.json({ error: "Failed to fetch consumers" }, { status: 500 });
        }

        return NextResponse.json({
            consumers: data ?? [],
            total: count ?? 0,
            page,
            limit,
        });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
