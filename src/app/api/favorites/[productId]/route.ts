import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ productId: string }> },
) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { productId } = await params;

    const { error } = await supabase
        .from("user_favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("product_id", productId);

    if (error) {
        return NextResponse.json({ error: "Failed to remove favorite" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
