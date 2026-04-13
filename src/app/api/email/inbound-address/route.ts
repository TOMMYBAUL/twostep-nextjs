import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN ?? "twostep.fr";

export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: merchant } = await supabase
        .from("merchants")
        .select("id, inbound_email_slug")
        .eq("user_id", user.id)
        .single();

    if (!merchant) return NextResponse.json({ error: "No merchant" }, { status: 404 });

    const slug = merchant.inbound_email_slug;
    if (!slug) return NextResponse.json({ error: "No inbound slug" }, { status: 404 });

    const address = `factures-${slug}@${INBOUND_DOMAIN}`;

    // Check if any invoice arrived via email
    const { data: lastEmail } = await supabase
        .from("invoices")
        .select("received_at")
        .eq("merchant_id", merchant.id)
        .eq("source", "email")
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    return NextResponse.json({
        address,
        has_received: !!lastEmail,
        last_received_at: lastEmail?.received_at ?? null,
    });
}
