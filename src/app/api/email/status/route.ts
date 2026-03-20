import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: merchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("user_id", user.id)
        .single();

    if (!merchant) return NextResponse.json({ error: "No merchant" }, { status: 404 });

    const { data: connection } = await supabase
        .from("email_connections")
        .select("provider, email_address, last_sync_at, status")
        .eq("merchant_id", merchant.id)
        .single();

    return NextResponse.json({ connection: connection ?? null });
}
