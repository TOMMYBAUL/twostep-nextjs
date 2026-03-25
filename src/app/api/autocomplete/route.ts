import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { autocompleteQuery, parseQuery } from "@/lib/validation";

export async function GET(request: NextRequest) {
    const limited = rateLimit(request.headers.get("x-forwarded-for") ?? null, "autocomplete", 40);
    if (limited) return limited;

    try {
        const parsed = parseQuery(request.nextUrl.searchParams, autocompleteQuery);
        if ("error" in parsed) return parsed.error;
        const { q } = parsed.data;

        if (q.length < 2) {
            return NextResponse.json({ suggestions: [] });
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
