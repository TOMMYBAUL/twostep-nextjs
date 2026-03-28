import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveMerchantId } from "@/lib/slug";

const PUBLIC_BADGE_TYPES = ["score-80", "streak-7"];

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const merchantId = await resolveMerchantId(id);
    if (!merchantId) return NextResponse.json({ badges: [] });

    const supabase = await createClient();
    const { data } = await supabase
        .from("achievements")
        .select("type, unlocked_at")
        .eq("merchant_id", merchantId)
        .in("type", PUBLIC_BADGE_TYPES);

    return NextResponse.json({ badges: data ?? [] }, {
        headers: { "Cache-Control": "public, max-age=300" },
    });
}
