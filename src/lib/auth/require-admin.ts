import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/** Returns the admin user or a 401/403 response */
export async function requireAdmin() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }

    if (user.app_metadata?.role !== "admin") {
        return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }

    return { user };
}
