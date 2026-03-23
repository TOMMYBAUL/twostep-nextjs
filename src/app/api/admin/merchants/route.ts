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
        const status = searchParams.get("status");
        const search = searchParams.get("search");

        const from = (page - 1) * limit;
        const to = from + limit - 1;

        const admin = createAdminClient();

        let query = admin
            .from("merchants")
            .select("id, name, address, city, status, phone, created_at, pos_type", { count: "exact" })
            .order("created_at", { ascending: false })
            .range(from, to);

        if (status && ["active", "pending", "suspended"].includes(status)) {
            query = query.eq("status", status);
        }

        if (search) {
            if (search.length > 200) {
                return NextResponse.json({ error: "Search query too long" }, { status: 400 });
            }
            // Sanitize search to prevent PostgREST filter injection
            const safe = search.replace(/[%,.()"'\\]/g, "");
            if (safe) {
                query = query.or(`name.ilike.%${safe}%,city.ilike.%${safe}%`);
            }
        }

        const { data, count, error } = await query;

        if (error) {
            return NextResponse.json({ error: "Failed to fetch merchants" }, { status: 500 });
        }

        return NextResponse.json({
            merchants: data ?? [],
            total: count ?? 0,
            page,
            limit,
        });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
