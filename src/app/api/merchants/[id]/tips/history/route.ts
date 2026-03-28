import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PER_PAGE = 20;

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: merchant } = await supabase.from("merchants").select("id").eq("id", id).eq("user_id", user.id).single();
    if (!merchant) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(request.url);
    const category = url.searchParams.get("category");
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const offset = (page - 1) * PER_PAGE;

    let query = supabase
        .from("coach_tips")
        .select("id, type, emoji, text, category, cta_label, cta_href, created_at", { count: "exact" })
        .eq("merchant_id", id)
        .order("created_at", { ascending: false })
        .range(offset, offset + PER_PAGE - 1);

    if (category) {
        query = query.eq("category", category);
    }

    const { data: tips, count, error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        tips: (tips ?? []).map((t) => ({
            id: t.id,
            type: t.type,
            emoji: t.emoji,
            text: t.text,
            category: t.category,
            cta: t.cta_label ? { label: t.cta_label, href: t.cta_href } : null,
            created_at: t.created_at,
        })),
        total: count ?? 0,
        page,
        per_page: PER_PAGE,
    }, { headers: { "Cache-Control": "private, max-age=60" } });
}
