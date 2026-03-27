import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getAdapter, POS_PROVIDERS, type POSProvider } from "@/lib/pos/index";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ provider: string }> },
) {
    try {
        const { provider } = await params;

        if (!POS_PROVIDERS.includes(provider as POSProvider)) {
            return NextResponse.json(
                { error: `Unknown POS provider: ${provider}` },
                { status: 400 },
            );
        }

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

        const adapter = getAdapter(provider);
        const authUrl = adapter.getAuthUrl(merchant.id);

        return NextResponse.json({ auth_url: authUrl });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
