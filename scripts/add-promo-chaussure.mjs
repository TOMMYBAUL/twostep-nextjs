/**
 * Ajoute une promo sur les Air Force 1 (chaussures) pour tester le filtre catégorie.
 * Run: node scripts/add-promo-chaussure.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const PRODUCT_ID = "c88c7073-0dd3-4c77-9ae8-ef620206e956"; // Air Force 1 '07
const MERCHANT_ID = "46525af7-6d12-4d72-849d-16bf6bb11564"; // Sneakers District

async function main() {
    // 1. Create promo
    const { data: promo, error: promoErr } = await supabase
        .from("promotions")
        .insert({
            product_id: PRODUCT_ID,
            sale_price: 89.99,
            starts_at: new Date().toISOString(),
            ends_at: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
        })
        .select()
        .single();

    if (promoErr) {
        console.error("❌ Promo error:", promoErr.message);
        return;
    }
    console.log("✅ Promo créée:", promo.id, "— Air Force 1 à 89.99€ (au lieu de 119.98€)");

    // 2. Create feed event
    const { error: feedErr } = await supabase
        .from("feed_events")
        .insert({
            merchant_id: MERCHANT_ID,
            product_id: PRODUCT_ID,
            event_type: "new_promo",
        });

    if (feedErr) {
        console.error("❌ Feed event error:", feedErr.message);
        return;
    }
    console.log("✅ Feed event créé — la promo apparaîtra dans Tendances et Promos du moment");
}

main();
