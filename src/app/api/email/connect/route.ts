import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gmailProvider } from "@/lib/email/gmail";

export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { provider, code, imap_credentials } = body;

    const { data: merchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("user_id", user.id)
        .single();

    if (!merchant) return NextResponse.json({ error: "No merchant" }, { status: 404 });

    if (provider === "gmail") {
        const tokens = await gmailProvider.exchangeCode(code);
        await supabase.from("email_connections").upsert({
            merchant_id: merchant.id,
            provider: "gmail",
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            email_address: tokens.email_address,
            status: "active",
        });
        return NextResponse.json({ email_address: tokens.email_address });
    }

    if (provider === "imap") {
        if (!imap_credentials?.host || !imap_credentials?.user || !imap_credentials?.pass) {
            return NextResponse.json({ error: "Missing IMAP credentials" }, { status: 400 });
        }
        await supabase.from("email_connections").upsert({
            merchant_id: merchant.id,
            provider: "imap",
            access_token: JSON.stringify(imap_credentials),
            refresh_token: null,
            email_address: imap_credentials.user,
            status: "active",
        });
        return NextResponse.json({ email_address: imap_credentials.user });
    }

    return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
}

export async function GET(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: merchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("user_id", user.id)
        .single();

    if (!merchant) return NextResponse.json({ error: "No merchant" }, { status: 404 });

    const provider = request.nextUrl.searchParams.get("provider") ?? "gmail";

    if (provider === "gmail") {
        const url = gmailProvider.getAuthUrl(merchant.id);
        return NextResponse.json({ auth_url: url });
    }

    if (provider === "outlook") {
        // Outlook OAuth is handled by outlook provider (Task 33)
        const { outlookProvider } = await import("@/lib/email/outlook");
        const url = outlookProvider.getAuthUrl(merchant.id);
        return NextResponse.json({ auth_url: url });
    }

    return NextResponse.json({ error: "Provider does not use OAuth" }, { status: 400 });
}
