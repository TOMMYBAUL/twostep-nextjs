import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin/guard";

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest): Promise<NextResponse> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isAdmin(user.email)) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const merchantId = url.searchParams.get("merchantId");
    const status = url.searchParams.get("status") ?? "pending";
    const limitRaw = url.searchParams.get("limit");
    const limit = Math.min(
        Math.max(Number.parseInt(limitRaw ?? "50", 10) || 50, 1),
        500,
    );

    if (!merchantId || !UUID_REGEX.test(merchantId)) {
        return NextResponse.json({ error: "invalid_merchant_id" }, { status: 400 });
    }
    if (!["pending", "enriched", "rejected", "duplicate"].includes(status)) {
        return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
        .from("import_staging")
        .select("id, raw_row, status, created_at, enriched_product_id, notes")
        .eq("merchant_id", merchantId)
        .eq("status", status)
        .order("id", { ascending: true })
        .limit(limit);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rows: data ?? [], count: data?.length ?? 0 });
}
