import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { data } = await supabase
            .from("consumer_profiles")
            .select("preferred_clothing_size, preferred_shoe_size, avatar_url")
            .eq("user_id", user.id)
            .single();

        return NextResponse.json({
            clothing_size: data?.preferred_clothing_size ?? null,
            shoe_size: data?.preferred_shoe_size ?? null,
            avatar_url: data?.avatar_url ?? null,
        });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "consumer:preferences", 10);
    if (limited) return limited;

    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await request.json();
        const { clothing_size, shoe_size } = body;

        const VALID_SIZES = ["2A", "4A", "6A", "8A", "10A", "12A", "14A", "16A", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];
        if (clothing_size !== null && clothing_size !== undefined && !VALID_SIZES.includes(clothing_size)) {
            return NextResponse.json({ error: "Invalid clothing size" }, { status: 400 });
        }
        if (shoe_size !== null && shoe_size !== undefined && (typeof shoe_size !== "number" || shoe_size < 18 || shoe_size > 50)) {
            return NextResponse.json({ error: "Invalid shoe size" }, { status: 400 });
        }

        const updates: Record<string, unknown> = {};
        if (clothing_size !== undefined) updates.preferred_clothing_size = clothing_size;
        if (shoe_size !== undefined) updates.preferred_shoe_size = shoe_size;

        // Upsert — create profile if it doesn't exist
        const { error } = await supabase
            .from("consumer_profiles")
            .upsert({
                user_id: user.id,
                ...updates,
            }, { onConflict: "user_id" });

        if (error) {
            return NextResponse.json({ error: "Failed to update preferences" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
