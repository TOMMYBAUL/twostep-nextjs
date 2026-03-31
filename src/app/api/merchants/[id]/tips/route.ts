import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import Groq from "groq-sdk";

const groq = process.env.GROQ_API_KEY
    ? new Groq({ apiKey: process.env.GROQ_API_KEY })
    : null;

type TipRow = {
    id: string;
    type: "insight" | "action";
    emoji: string;
    text: string;
    category: string;
    cta_label: string | null;
    cta_href: string | null;
    created_at: string;
};

const FALLBACK_INSIGHT = {
    emoji: "📊",
    text: "Votre boutique est active sur Two-Step. Revenez demain pour un résumé personnalisé de votre situation.",
    category: "engagement",
};

const FALLBACK_ACTION = {
    emoji: "✨",
    text: "Gardez votre stock à jour et ajoutez des photos pour attirer plus de clients dans votre quartier.",
    category: "photos",
    cta: null,
};

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "tips", 10);
    if (limited) return limited;

    const { id } = await params;
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const today = new Date().toISOString().slice(0, 10);

    // Check DB cache
    const { data: existing } = await supabase
        .from("coach_tips")
        .select("*")
        .eq("merchant_id", id)
        .gte("created_at", `${today}T00:00:00`)
        .order("created_at", { ascending: false })
        .limit(2);

    if (existing && existing.length === 2) {
        const insight = existing.find((t: TipRow) => t.type === "insight");
        const action = existing.find((t: TipRow) => t.type === "action");
        if (insight && action) {
            return NextResponse.json({
                insight: { emoji: insight.emoji, text: insight.text, category: insight.category },
                action: {
                    emoji: action.emoji,
                    text: action.text,
                    category: action.category,
                    cta: action.cta_label ? { label: action.cta_label, href: action.cta_href } : null,
                },
            }, { headers: { "Cache-Control": "private, max-age=3600" } });
        }
    }

    const statsRes = await fetch(`${request.nextUrl.origin}/api/merchants/${id}/stats`, {
        headers: { cookie: request.headers.get("cookie") ?? "" },
    });

    if (!statsRes.ok) {
        return NextResponse.json({
            insight: FALLBACK_INSIGHT,
            action: FALLBACK_ACTION,
        });
    }

    const stats = await statsRes.json();

    const { data: merchant } = await supabase
        .from("merchants")
        .select("name, description, photo_url")
        .eq("id", id)
        .single();

    const prompt = `Tu es un coach business bienveillant pour des commerçants locaux à Toulouse qui utilisent Two-Step (une app qui rend leur stock visible aux consommateurs du quartier).

Voici les données du marchand "${merchant?.name || "ce marchand"}" cette semaine :
- Vues boutique : ${stats.funnel.views.current} (semaine dernière : ${stats.funnel.views.previous})
- Favoris reçus : ${stats.funnel.favorites.current} (semaine dernière : ${stats.funnel.favorites.previous})
- Abonnés : ${stats.funnel.follows.total}
- Produits total : ${stats.stock.total}
- En stock : ${stats.stock.inStock}
- Stock bas (≤3) : ${stats.stock.lowStock}
- Ruptures : ${stats.stock.outOfStock}
- Avec photo : ${stats.stock.withPhoto}
- Promos actives : ${stats.activePromos}
- Score Two-Step : ${stats.score}/100
${merchant?.photo_url ? "- A une photo de boutique" : "- Pas de photo de boutique"}
${merchant?.description ? "- A une description" : "- Pas de description"}

Génère EXACTEMENT un JSON avec deux tips :
1. Un "insight" : constat analytique sur la situation du marchand (ce qui se passe, tendances, chiffres clés). Ton descriptif.
2. Une "action" : conseil actionnable concret. Ton prescriptif, comme un ami qui aide.

Catégories possibles : photos, stock, promos, profil, engagement.
Varie les catégories entre insight et action.

Pour l'action, si le conseil mène à une page de l'app, fournis un CTA :
- Photos manquantes → cta: {"label": "Ajouter une photo", "href": "/dashboard/products?filter=no-photo"}
- Créer promo → cta: {"label": "Créer une promo", "href": "/dashboard/promotions/new"}
- Compléter profil → cta: {"label": "Modifier ma boutique", "href": "/dashboard/store"}
- Stock à mettre à jour → cta: {"label": "Gérer le stock", "href": "/dashboard/products"}
- Si le conseil est externe (réseaux sociaux, etc.) → cta: null

Réponds UNIQUEMENT avec le JSON, rien d'autre :
{
  "insight": {"emoji": "📊", "text": "...", "category": "..."},
  "action": {"emoji": "💡", "text": "...", "category": "...", "cta": {"label": "...", "href": "..."} | null}
}`;

    try {
        if (!groq) throw new Error("Groq not configured");
        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 400,
            temperature: 0.7,
            response_format: { type: "json_object" },
        });

        const raw = completion.choices[0]?.message?.content?.trim() ?? "";
        const parsed = JSON.parse(raw);

        const insight = {
            emoji: parsed.insight?.emoji || "📊",
            text: parsed.insight?.text || FALLBACK_INSIGHT.text,
            category: parsed.insight?.category || "engagement",
        };

        const action = {
            emoji: parsed.action?.emoji || "💡",
            text: parsed.action?.text || FALLBACK_ACTION.text,
            category: parsed.action?.category || "photos",
            cta: parsed.action?.cta || null,
        };

        await supabase.from("coach_tips").insert([
            { merchant_id: id, type: "insight", emoji: insight.emoji, text: insight.text, category: insight.category },
            {
                merchant_id: id, type: "action", emoji: action.emoji, text: action.text,
                category: action.category, cta_label: action.cta?.label ?? null, cta_href: action.cta?.href ?? null,
            },
        ]);

        return NextResponse.json({ insight, action }, {
            headers: { "Cache-Control": "private, max-age=3600" },
        });
    } catch {
        return NextResponse.json({
            insight: FALLBACK_INSIGHT,
            action: FALLBACK_ACTION,
        });
    }
}
