import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ALL_ACHIEVEMENT_TYPES, type AchievementType } from "@/lib/achievements";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
        .from("achievements")
        .select("id, merchant_id, type, unlocked_at")
        .eq("merchant_id", id)
        .order("unlocked_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ achievements: data ?? [] }, {
        headers: { "Cache-Control": "private, max-age=60" },
    });
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: merchant } = await supabase.from("merchants").select("id").eq("id", id).eq("user_id", user.id).single();
    if (!merchant) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const type = body.type as AchievementType;

    if (!ALL_ACHIEVEMENT_TYPES.includes(type)) {
        return NextResponse.json({ error: "Invalid achievement type" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("achievements")
        .insert({ merchant_id: id, type })
        .select("id, merchant_id, type, unlocked_at")
        .single();

    if (error) {
        if (error.code === "23505") {
            return NextResponse.json({ error: "Already unlocked" }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ achievement: data }, { status: 201 });
}
