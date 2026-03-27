import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// In-memory cache: merchant_id -> { tip, emoji, date }
const tipCache = new Map<string, { tip: string; emoji: string; date: string }>();

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();

    // Auth check
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const today = new Date().toISOString().slice(0, 10);

    // Check cache
    const cached = tipCache.get(id);
    if (cached && cached.date === today) {
        return NextResponse.json({ emoji: cached.emoji, text: cached.tip });
    }

    // Fetch stats for context
    const statsRes = await fetch(`${request.nextUrl.origin}/api/merchants/${id}/stats`, {
        headers: { cookie: request.headers.get("cookie") ?? "" },
    });

    if (!statsRes.ok) {
        return NextResponse.json({
            emoji: "✨",
            text: "Continuez à mettre votre stock à jour pour attirer plus de clients.",
        });
    }

    const stats = await statsRes.json();

    // Fetch merchant name and profile info
    const { data: merchant } = await supabase
        .from("merchants")
        .select("name, description, photo_url")
        .eq("id", id)
        .single();

    // Build prompt
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

Donne UN SEUL conseil actionnable en 1-2 phrases maximum. Le ton est celui d'un ami qui aide, pas d'un admin qui contrôle. Sois spécifique aux données ci-dessus. Commence par un emoji pertinent suivi d'un espace puis le conseil.

Exemples de bon format :
📸 Vos 3 produits sans photo passent inaperçus — ajoutez une photo rapide avec votre téléphone, ça prend 30 secondes.
🏷️ Aucune promo active cette semaine. Une petite remise de 10% sur un article suffit à apparaître dans "Promos du moment".
📈 +40% de vues cette semaine, bravo ! Profitez de cette visibilité pour ajouter 2-3 nouveaux produits.

Réponds UNIQUEMENT avec l'emoji + le conseil, rien d'autre.`;

    try {
        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 150,
            temperature: 0.7,
        });

        const response = completion.choices[0]?.message?.content?.trim() ?? "";

        // Parse emoji from response
        const emojiMatch = response.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)/u);
        const emoji = emojiMatch ? emojiMatch[0] : "💡";
        const text = emojiMatch ? response.slice(emojiMatch[0].length).trim() : response;

        // Cache for today
        tipCache.set(id, { tip: text, emoji, date: today });

        return NextResponse.json({ emoji, text }, {
            headers: { "Cache-Control": "private, max-age=3600" },
        });
    } catch {
        // Fallback to static tip
        return NextResponse.json({
            emoji: "✨",
            text: "Gardez votre stock à jour et ajoutez des photos pour attirer plus de clients dans votre quartier.",
        });
    }
}
