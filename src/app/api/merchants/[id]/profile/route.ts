import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

        // Try to get user without blocking — use cookie-based client only if cookies exist
        let userId: string | null = null;
        const hasCookies = request.cookies.getAll().some(c => c.name.startsWith("sb-"));
        if (hasCookies) {
            try {
                const userClient = await createClient();
                const { data: { user } } = await userClient.auth.getUser();
                userId = user?.id ?? null;
            } catch { /* ignore auth errors */ }
        }

        const supabase = createAdminClient();
        const { data, error } = await supabase.rpc("get_merchant_profile", {
            target_merchant_id: merchantId,
            requesting_user_id: userId,
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
