import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
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
