import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET() {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { count } = await supabase
        .from("merchants")
        .select("*", { count: "exact", head: true })
        .eq("status", "active");

    return NextResponse.json(
        { count: Math.min(count ?? 0, 30) },
        { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
}
