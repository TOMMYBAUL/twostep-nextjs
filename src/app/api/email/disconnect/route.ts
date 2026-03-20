import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: merchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("user_id", user.id)
        .single();

    if (!merchant) return NextResponse.json({ error: "No merchant" }, { status: 404 });

    await supabase
        .from("email_connections")
        .delete()
        .eq("merchant_id", merchant.id);

    return NextResponse.json({ ok: true });
}
