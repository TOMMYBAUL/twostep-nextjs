import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function POST() {
    try {
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

        // Remove from pos_connections
        const { error: connError } = await supabase
            .from("pos_connections")
            .delete()
            .eq("merchant_id", merchant.id);

        if (connError) {
            return NextResponse.json({ error: "Failed to remove connection" }, { status: 500 });
        }

        // Clear POS fields on merchant
        const { error: merchError } = await supabase
            .from("merchants")
            .update({ pos_type: null, pos_last_sync: null })
            .eq("id", merchant.id);

        if (merchError) {
            return NextResponse.json({ error: "Failed to update merchant" }, { status: 500 });
        }

        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
