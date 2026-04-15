/**
 * TEMPORAIRE — Injecte 15 photos premium UPCitemdb dans les produits existants
 * pour prendre des screenshots marketing. À REVERTER après.
 *
 * Usage: node scripts/inject-premium-screenshots.mjs
 * Revert: node scripts/inject-premium-screenshots.mjs --revert
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local
const envPath = resolve(__dirname, "..", ".env.local");
try {
    const envContent = readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = value;
    }
} catch { console.error("Could not read .env.local"); process.exit(1); }

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const BACKUP_PATH = resolve(__dirname, "premium-screenshots-backup.json");

// Premium photos from UPCitemdb
const PREMIUM_PRODUCTS = [
    { name: "Air Force 1 '07",       brand: "Nike",              photo: "https://n.nordstrommedia.com/id/sr3/462b40fd-44bd-40ba-a5cc-063dd7909584.jpeg",         ean: "0191887655022",  price: 119.99 },
    { name: "Stan Smith",             brand: "Adidas",            photo: "https://n.nordstrommedia.com/id/sr3/15c1e5b2-8fb8-4399-8491-16c1c501ef3e.jpeg",         ean: "0887383687383",  price: 94.99 },
    { name: "Gel-1130",               brand: "Asics",             photo: "https://media.finishline.com/s/finishline/1202A163_100?$Main$&hei=453&wid=453",         ean: "0196074149117",  price: 129.99 },
    { name: "Old Skool",              brand: "Vans",              photo: "https://n.nordstrommedia.com/id/sr3/fd510928-904b-4e25-a05e-bab0ebfef156.jpeg?w=500",   ean: "0700053803770",  price: 74.99 },
    { name: "Clifton 9",              brand: "Hoka",              photo: "https://n.nordstrommedia.com/id/sr3/75715d4a-c1ee-4bc3-b823-a7361cebf71d.jpeg?w=500",   ean: "0196565172419",  price: 139.99 },
    { name: "Jean flare taille haute",brand: "Levi's",            photo: "https://slimages.macysassets.com/is/image/MCY/products/6/optimized/11703926_fpx.tif?wid=300&fmt=jpeg&qlt=100", ean: "0192531771402", price: 109.99 },
    { name: "Pull col V cachemire",   brand: "Ralph Lauren",      photo: "https://i5.walmartimages.com/asr/bb789d75-dc2f-44ff-bdd5-b8f4b5dc9ffa.708c864f41ed9d9b6f0409a5f5a9c3ec.jpeg?odnHeight=450&odnWidth=450&odnBg=ffffff", ean: "0738085616235", price: 149.99 },
    { name: "Doudoune sans manches",  brand: "The North Face",    photo: "http://content.nordstrom.com/imagegallery/store/product/large/11/_9833051.jpg",         ean: "0887867904395",  price: 189.99 },
    { name: "Sweat col rond",         brand: "Champion",          photo: "https://i5.walmartimages.com/asr/12a8f6b6-337e-4cfc-a03f-9ce2d03ccbd2_1.808673f10fc34ddc9ff9e6d068ca73c7.jpeg?odnHeight=450&odnWidth=450&odnBg=ffffff", ean: "0090563294886", price: 64.99 },
    { name: "G-Shock GA-2100",        brand: "Casio",             photo: "https://i5.walmartimages.com/asr/1d082914-2e1c-4f08-b6bd-eccb7c54e832.f568bf4d608ce87963b500ccad22d78b.jpeg?odnHeight=450&odnWidth=450&odnBg=ffffff", ean: "0464074888085", price: 99.99 },
    { name: "Montre Presage",         brand: "Seiko",             photo: "http://site.unbeatablesale.com/CRTNW2270.JPG",                                         ean: "4954628229809",  price: 349.99 },
    { name: "Bracelet Moments",       brand: "Pandora",           photo: "https://n.nordstrommedia.com/id/sr3/b155f594-e2ed-43e2-a5e0-ce51bb39ec96.jpeg",         ean: "5700302003802",  price: 69.99 },
    { name: "Huile Prodigieuse Or",   brand: "Nuxe",              photo: "https://i5.walmartimages.com/asr/bdfd4b34-6c95-48fb-8026-2bda4c8dfdbb_1.1d729884d9ffebd6dc6b665d9777c016.jpeg?odnHeight=450&odnWidth=450&odnBg=ffffff", ean: "3264680002021", price: 36.90 },
    { name: "Eau Micellaire",         brand: "Bioderma",          photo: "https://i5.walmartimages.com/asr/ef311730-bdd3-4ff2-b276-be5baeafe958.42f7988eb8293d758db970bdb4cdec1a.jpeg?odnHeight=450&odnWidth=450&odnBg=ffffff", ean: "0100145083743", price: 14.90 },
    { name: "Forerunner 265",         brand: "Garmin",            photo: "https://i5.walmartimages.com/asr/4001f023-49ac-4037-b410-cd82146e7c77.d78badb732a85644815d6471ba6ff3d1.jpeg?odnHeight=450&odnWidth=450&odnBg=ffffff", ean: "0753759313654", price: 349.99 },
];

async function inject() {
    console.log("📸 Injecting 15 premium photos for screenshots...\n");

    // Get all products with their current photos (for backup)
    const { data: products, error } = await supabase
        .from("products")
        .select("id, name, photo_url, ean, created_at")
        .eq("visible", true)
        .order("created_at", { ascending: false })
        .limit(50);

    if (error) { console.error("Failed to fetch products:", error.message); process.exit(1); }

    // Backup current state
    const backup = products.map(p => ({ id: p.id, photo_url: p.photo_url, ean: p.ean, created_at: p.created_at }));
    writeFileSync(BACKUP_PATH, JSON.stringify(backup, null, 2));
    console.log(`💾 Backup saved to ${BACKUP_PATH} (${backup.length} products)\n`);

    // Match premium products to existing products by name similarity
    let updated = 0;
    for (const premium of PREMIUM_PRODUCTS) {
        // Find the best matching product in the DB
        const match = products.find(p =>
            p.name.toLowerCase().includes(premium.name.toLowerCase()) ||
            premium.name.toLowerCase().includes(p.name.toLowerCase().split(" — ")[0])
        );

        if (match) {
            const { error: updateError } = await supabase
                .from("products")
                .update({
                    photo_url: premium.photo,
                    ean: premium.ean,
                    created_at: new Date(Date.now() - updated * 60000).toISOString(), // Stagger to keep order
                })
                .eq("id", match.id);

            if (!updateError) {
                console.log(`✓ ${premium.name.padEnd(28)} → ${match.name.substring(0, 30)}`);
                updated++;
            } else {
                console.log(`✗ ${premium.name.padEnd(28)} — ${updateError.message}`);
            }
        } else {
            console.log(`? ${premium.name.padEnd(28)} — no match in DB, skipping`);
        }
    }

    console.log(`\n✅ ${updated}/15 products updated with premium photos.`);
    console.log(`\n⚠️  To revert: node scripts/inject-premium-screenshots.mjs --revert`);
}

async function revert() {
    if (!existsSync(BACKUP_PATH)) {
        console.error("No backup found at", BACKUP_PATH);
        process.exit(1);
    }

    const backup = JSON.parse(readFileSync(BACKUP_PATH, "utf-8"));
    console.log(`🔄 Reverting ${backup.length} products to original photos...\n`);

    let reverted = 0;
    for (const item of backup) {
        const { error } = await supabase
            .from("products")
            .update({ photo_url: item.photo_url, ean: item.ean, created_at: item.created_at })
            .eq("id", item.id);

        if (!error) reverted++;
    }

    console.log(`✅ ${reverted}/${backup.length} products reverted.`);
}

const isRevert = process.argv.includes("--revert");
if (isRevert) {
    revert().catch(console.error);
} else {
    inject().catch(console.error);
}
