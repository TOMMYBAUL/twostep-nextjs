import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { favoriteBody, parseBody } from "@/lib/validation";

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { data, error } = await supabase
            .from("user_favorites")
            .select("*, products(*, stock(quantity), merchants(name, address, city))")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

        if (error) {
            return NextResponse.json({ error: "Failed to fetch favorites" }, { status: 500 });
        }

        return NextResponse.json({ favorites: data ?? [] });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const parsed = await parseBody(request, favoriteBody);
        if ("error" in parsed) return parsed.error;
        const { product_id } = parsed.data;

        const { data, error } = await supabase
            .from("user_favorites")
            .insert({ user_id: user.id, product_id })
            .select()
            .single();

        if (error) {
            if (error.code === "23505") {
                return NextResponse.json({ error: "Already favorited" }, { status: 409 });
            }
            return NextResponse.json({ error: "Failed to add favorite" }, { status: 500 });
        }

        return NextResponse.json({ favorite: data }, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
