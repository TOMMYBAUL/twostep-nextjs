import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
    const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "pioneers", 60);
    if (limited) return limited;
    const supabase = await createClient();

    const { count } = await supabase
        .from("merchants")
        .select("*", { count: "exact", head: true })
        .eq("status", "active");

    return NextResponse.json(
        { count: Math.min(count ?? 0, 30) },
        { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
}
