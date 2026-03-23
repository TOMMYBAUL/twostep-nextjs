import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID_STATUSES = ["active", "pending", "suspended"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const auth = await requireAdmin();
        if ("error" in auth) return auth.error;

        const { id } = await params;

        if (!id || typeof id !== "string") {
            return NextResponse.json({ error: "Invalid merchant ID" }, { status: 400 });
        }

        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const { status } = body;

        if (!status || !VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
            return NextResponse.json(
                { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
                { status: 400 },
            );
        }

        const admin = createAdminClient();

        const { data, error } = await admin
            .from("merchants")
            .update({ status })
            .eq("id", id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: "Failed to update merchant" }, { status: 500 });
        }

        if (!data) {
            return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
        }

        return NextResponse.json({ merchant: data });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
