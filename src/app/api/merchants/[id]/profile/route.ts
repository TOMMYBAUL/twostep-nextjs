import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveMerchantId } from "@/lib/slug";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;

        if (!id || typeof id !== "string") {
            return NextResponse.json({ error: "Invalid merchant ID" }, { status: 400 });
        }

        const merchantId = await resolveMerchantId(id);
        if (!merchantId) {
            return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
        }

        const supabase = await createClient();

        // Get current user (optional — unauthenticated users can view profiles)
        const { data: { user } } = await supabase.auth.getUser();

        const { data, error } = await supabase.rpc("get_merchant_profile", {
            target_merchant_id: merchantId,
            requesting_user_id: user?.id ?? null,
        });

        if (error || !data || data.length === 0) {
            return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
        }

        return NextResponse.json({ merchant: data[0] }, {
            headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
        });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
