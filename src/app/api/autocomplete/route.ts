import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
    const q = request.nextUrl.searchParams.get("q") ?? "";

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
}
