import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ merchantId: string }> },
) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { merchantId } = await params;

    const { error } = await supabase
        .from("user_follows")
        .delete()
        .eq("user_id", user.id)
        .eq("merchant_id", merchantId);

    if (error) {
        return NextResponse.json({ error: "Failed to unfollow" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
