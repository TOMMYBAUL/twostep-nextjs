import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import Groq from "groq-sdk";

const groq = process.env.GROQ_API_KEY
    ? new Groq({ apiKey: process.env.GROQ_API_KEY })
    : null;

const SYSTEM_PROMPT = `Tu es un filtre de suggestions pour des boutiques locales.
Tu reçois un message d'un consommateur destiné au marchand.

Règles :
- Si le message est constructif, bienveillant et contient un axe d'amélioration concret → réponds "pass"
- Si le message est insultant, méchant, vulgaire, moqueur ou sans fond constructif → réponds "reject"
- Si le message a un fond valide mais un ton négatif → reformule-le de façon bienveillante et constructive, en gardant le sens. Réponds "rewrite:" suivi de ta version.

Réponds UNIQUEMENT "pass", "reject", ou "rewrite: [texte reformulé]". Rien d'autre.`;

export async function POST(req: NextRequest) {
    const limited = await rateLimit(req.headers.get("x-forwarded-for") ?? null, "suggestions", 10);
    if (limited) return limited;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Non connecté" }, { status: 401 });
    }

    const body = await req.json();
    const { merchant_id, text } = body;

    if (!merchant_id || !text || typeof text !== "string") {
        return NextResponse.json({ error: "Champs manquants" }, { status: 400 });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(merchant_id)) {
        return NextResponse.json({ error: "merchant_id invalide" }, { status: 400 });
    }

    const trimmed = text.trim();
    if (trimmed.length === 0 || trimmed.length > 500) {
        return NextResponse.json({ error: "Message entre 1 et 500 caractères" }, { status: 400 });
    }

    // Rate limit: max 3 suggestions per consumer per merchant per day
    const { count } = await supabase
        .from("suggestions")
        .select("id", { count: "exact", head: true })
        .eq("consumer_id", user.id)
        .eq("merchant_id", merchant_id)
        .gte("created_at", new Date(Date.now() - 86400000).toISOString());

    if ((count ?? 0) >= 3) {
        return NextResponse.json({ ok: true });
    }

    // AI filtering via Groq
    let verdict = "pass";
    let rewrittenText: string | null = null;

    try {
        if (!groq) throw new Error("Groq not configured");
        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: trimmed },
            ],
            temperature: 0.1,
            max_tokens: 300,
        });

        const response = completion.choices[0]?.message?.content?.trim() ?? "pass";

        if (response === "reject") {
            verdict = "reject";
        } else if (response.startsWith("rewrite:")) {
            verdict = "rewrite";
            rewrittenText = response.slice("rewrite:".length).trim();
        }
    } catch {
        verdict = "pass";
    }

    if (verdict === "reject") {
        return NextResponse.json({ ok: true });
    }

    await supabase.from("suggestions").insert({
        merchant_id,
        consumer_id: user.id,
        text: verdict === "rewrite" ? rewrittenText : trimmed,
        original_text: verdict === "rewrite" ? trimmed : null,
    });

    return NextResponse.json({ ok: true });
}
