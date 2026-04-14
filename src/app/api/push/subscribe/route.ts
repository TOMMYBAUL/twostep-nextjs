import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { captureError } from "@/lib/error";

/**
 * POST /api/push/subscribe — Store a push subscription for the authenticated user.
 * DELETE /api/push/subscribe — Remove push subscription.
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const subscription = await request.json();
        if (
            !subscription ||
            typeof subscription.endpoint !== "string" ||
            !subscription.endpoint.startsWith("https://") ||
            typeof subscription.keys?.p256dh !== "string" ||
            typeof subscription.keys?.auth !== "string"
        ) {
            return NextResponse.json({ error: "Invalid subscription: requires endpoint (https), keys.p256dh and keys.auth" }, { status: 400 });
        }

        const { error } = await supabase.from("push_subscriptions").upsert(
            {
                user_id: user.id,
                endpoint: subscription.endpoint,
                keys: subscription.keys,
                subscription: subscription,
            },
            { onConflict: "user_id,endpoint" },
        );

        if (error) {
            captureError(error, { route: "push/subscribe" });
            return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
        }

        return NextResponse.json({ ok: true });
    } catch (e) {
        captureError(e, { route: "push/subscribe" });
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { endpoint } = await request.json();
        if (!endpoint) {
            return NextResponse.json({ error: "endpoint required" }, { status: 400 });
        }

        await supabase
            .from("push_subscriptions")
            .delete()
            .eq("user_id", user.id)
            .eq("endpoint", endpoint);

        return NextResponse.json({ ok: true });
    } catch (e) {
        captureError(e, { route: "push/subscribe" });
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
