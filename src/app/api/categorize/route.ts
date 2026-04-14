import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { categorizeMerchantProducts } from "@/lib/ai/categorize";
import { captureError } from "@/lib/error";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
    const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "categorize", 3);
    if (limited) return limited;

    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { data: merchant } = await supabase
            .from("merchants")
            .select("id")
            .eq("user_id", user.id)
            .single();

        if (!merchant) return NextResponse.json({ error: "No merchant" }, { status: 404 });

        const result = await categorizeMerchantProducts(merchant.id);
        return NextResponse.json(result);
    } catch (err) {
        captureError(err, { route: "categorize" });
        return NextResponse.json({ error: "Categorization failed" }, { status: 500 });
    }
}
