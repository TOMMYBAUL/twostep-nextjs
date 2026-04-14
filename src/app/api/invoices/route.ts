import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { data: merchant } = await supabase
            .from("merchants")
            .select("id")
            .eq("user_id", user.id)
            .single();

        if (!merchant) return NextResponse.json({ error: "No merchant" }, { status: 404 });

        const { data: invoices, error } = await supabase
            .from("invoices")
            .select("*, invoice_items(*)")
            .eq("merchant_id", merchant.id)
            .order("received_at", { ascending: false });

        if (error) {
            return NextResponse.json({ error: "Failed to fetch invoices" }, { status: 500 });
        }

        return NextResponse.json(invoices ?? []);
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { data: merchant } = await supabase
            .from("merchants")
            .select("id")
            .eq("user_id", user.id)
            .single();

        if (!merchant) return NextResponse.json({ error: "No merchant" }, { status: 404 });

        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const validSources = ["email", "upload", "manual"];
        const source = body.source ?? "email";
        if (typeof source !== "string" || !validSources.includes(source)) {
            return NextResponse.json({ error: `source must be one of: ${validSources.join(", ")}` }, { status: 400 });
        }

        // Validate optional fields
        const senderEmail = body.sender_email ?? null;
        if (senderEmail !== null) {
            if (typeof senderEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail)) {
                return NextResponse.json({ error: "sender_email format invalide" }, { status: 400 });
            }
        }

        const fileUrl = body.file_url ?? null;
        if (fileUrl !== null) {
            if (typeof fileUrl !== "string") {
                return NextResponse.json({ error: "file_url doit être une chaîne" }, { status: 400 });
            }
            try {
                const parsed = new URL(fileUrl);
                if (!["http:", "https:"].includes(parsed.protocol)) {
                    return NextResponse.json({ error: "file_url doit être une URL http(s)" }, { status: 400 });
                }
            } catch {
                return NextResponse.json({ error: "file_url format invalide" }, { status: 400 });
            }
        }

        const { data: invoice, error } = await supabase
            .from("invoices")
            .insert({
                merchant_id: merchant.id,
                source,
                sender_email: senderEmail,
                supplier_name: body.supplier_name ?? null,
                file_url: fileUrl,
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 });
        }

        return NextResponse.json(invoice, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
