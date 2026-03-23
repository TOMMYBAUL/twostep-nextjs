import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        if (!id || typeof id !== "string") {
            return NextResponse.json({ error: "Invalid promotion ID" }, { status: 400 });
        }

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Verify ownership: promotion → product → merchant → user
        const { data: promo } = await supabase
            .from("promotions")
            .select("id, products!inner(merchant_id, merchants!inner(user_id))")
            .eq("id", id)
            .single();

        if (!promo || (promo as any).products?.merchants?.user_id !== user.id) {
            return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
        }

        const { error } = await supabase.from("promotions").delete().eq("id", id);

        if (error) {
            return NextResponse.json({ error: "Operation failed" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
