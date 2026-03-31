import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { data: merchant } = await supabase
            .from("merchants")
            .select("id")
            .eq("user_id", user.id)
            .single();

        if (!merchant) {
            return NextResponse.json({ error: "No merchant profile" }, { status: 403 });
        }

        // Get all visible products for this merchant
        const { data: products } = await supabase
            .from("products")
            .select("ean, price, photo_url, photo_processed_url, visible")
            .eq("merchant_id", merchant.id)
            .eq("visible", true);

        if (!products) {
            return NextResponse.json({
                total_visible: 0,
                eligible_google: 0,
                missing_ean: 0,
                missing_photo: 0,
                missing_price: 0,
                score: 0,
            });
        }

        const total_visible = products.length;
        const missing_ean = products.filter((p) => !p.ean).length;
        const missing_photo = products.filter((p) => !p.photo_url && !p.photo_processed_url).length;
        const missing_price = products.filter((p) => p.price === null).length;
        const eligible_google = products.filter((p) => p.ean && p.price !== null).length;
        const score = total_visible > 0 ? Math.round((eligible_google / total_visible) * 100) : 0;

        return NextResponse.json({
            total_visible,
            eligible_google,
            missing_ean,
            missing_photo,
            missing_price,
            score,
        });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
