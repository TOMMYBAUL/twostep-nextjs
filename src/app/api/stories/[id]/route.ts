import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify ownership: story must belong to user's merchant
    const { data: merchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("user_id", user.id)
        .single();

    if (!merchant) return NextResponse.json({ error: "Not a merchant" }, { status: 403 });

    const { error } = await supabase
        .from("merchant_stories")
        .delete()
        .eq("id", id)
        .eq("merchant_id", merchant.id);

    if (error) {
        return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
