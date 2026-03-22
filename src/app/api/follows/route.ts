import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
        .from("user_follows")
        .select("*, merchants(name, description, photo_url, logo_url, city)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

    if (error) {
        return NextResponse.json({ error: "Failed to fetch follows" }, { status: 500 });
    }

    return NextResponse.json({ follows: data ?? [] });
}

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { merchant_id } = await request.json();

    if (!merchant_id) {
        return NextResponse.json({ error: "merchant_id required" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("user_follows")
        .insert({ user_id: user.id, merchant_id })
        .select()
        .single();

    if (error) {
        if (error.code === "23505") {
            return NextResponse.json({ error: "Already following" }, { status: 409 });
        }
        return NextResponse.json({ error: "Failed to follow" }, { status: 500 });
    }

    return NextResponse.json({ follow: data }, { status: 201 });
}
