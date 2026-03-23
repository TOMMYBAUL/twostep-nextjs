import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
    const limited = rateLimit(request.headers.get("x-forwarded-for") ?? null, "autocomplete", 40);
    if (limited) return limited;

    try {
        const q = request.nextUrl.searchParams.get("q") ?? "";

        if (q.length < 2) {
            return NextResponse.json({ suggestions: [] });
        }

        if (q.length > 200) {
            return NextResponse.json({ error: "Query too long (max 200 characters)" }, { status: 400 });
        }

        const supabase = await createClient();

        const { data, error } = await supabase.rpc("autocomplete_suggestions", {
            query_text: q,
            result_limit: 10,
        });

        if (error) {
            return NextResponse.json({ error: "Autocomplete failed" }, { status: 500 });
        }

        return NextResponse.json({ suggestions: data ?? [] });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
