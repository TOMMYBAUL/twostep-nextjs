import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { productConfidence, stockRowToConfidenceInput } from "@/lib/stock/product-confidence";
import { reportsWindowStartIso } from "@/lib/stock/reports";

const EAN_REGEX = /^[0-9]{8,14}$/;

export async function GET(request: NextRequest) {
    const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "products:by-ean", 120);
    if (limited) return limited;

    const { searchParams } = new URL(request.url);
    const ean = searchParams.get("ean")?.trim();
    const merchantIdParam = searchParams.get("merchant_id");

    if (!ean || !EAN_REGEX.test(ean)) {
        return NextResponse.json({ error: "Invalid EAN" }, { status: 400 });
    }
    if (!merchantIdParam) {
        return NextResponse.json({ error: "merchant_id required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: merchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("id", merchantIdParam)
        .eq("user_id", user.id)
        .maybeSingle();
    if (!merchant) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const headers = { "Cache-Control": "private, max-age=60" } as const;

    const { data: merchantHit } = await supabase
        .from("products")
        .select("id, slug, name, canonical_name, brand, category, photo_url, photo_processed_url, price, ean, pos_item_id, stock(quantity, updated_at, source, source_ts)")
        .eq("ean", ean)
        .eq("merchant_id", merchant.id)
        .is("archived_at", null)
        .maybeSingle();

    if (merchantHit) {
        // RLS : le marchand lit son propre jeton d'ingestion et ses signalements.
        const stockInput = stockRowToConfidenceInput((merchantHit as any).stock);
        const [{ data: ingest }, { count: reportCount }] = await Promise.all([
            supabase.from("ingest_credentials").select("merchant_id").eq("merchant_id", merchant.id).maybeSingle(),
            supabase
                .from("stock_reports")
                .select("id", { count: "exact", head: true })
                .eq("product_id", (merchantHit as any).id)
                .eq("reason", "not_in_store")
                .gte("created_at", reportsWindowStartIso()),
        ]);
        const confidence = productConfidence({
            ...stockInput,
            posItemId: (merchantHit as any).pos_item_id ?? null,
            merchantHasIngest: !!ingest,
            recentNotInStoreReports: reportCount ?? 0,
        });
        return NextResponse.json({ status: "merchant_hit", product: { ...merchantHit, confidence } }, { headers });
    }

    const { data: globalHit } = await supabase
        .from("products")
        .select("id, name, canonical_name, brand, category, photo_url, photo_processed_url")
        .eq("ean", ean)
        .is("archived_at", null)
        .limit(1)
        .maybeSingle();

    if (globalHit) {
        return NextResponse.json({ status: "global_hit", product: globalHit }, { headers });
    }

    return NextResponse.json({ status: "miss" }, { headers });
}
