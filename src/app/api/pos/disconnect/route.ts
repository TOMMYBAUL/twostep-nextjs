import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function POST() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: merchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("user_id", user.id)
        .single();

    if (!merchant) {
        return NextResponse.json({ error: "No merchant profile" }, { status: 403 });
    }

    // Remove credentials
    await supabase
        .from("merchant_pos_credentials")
        .delete()
        .eq("merchant_id", merchant.id);

    // Clear POS fields on merchant
    await supabase
        .from("merchants")
        .update({ pos_type: null, pos_last_sync: null })
        .eq("id", merchant.id);

    return NextResponse.json({ ok: true });
}
