import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createImageJobsForMerchant } from "@/lib/images/jobs";

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

        const created = await createImageJobsForMerchant(merchant.id);

        return NextResponse.json({ jobs_created: created });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
