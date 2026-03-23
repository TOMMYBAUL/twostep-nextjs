/**
 * Two-Step — Update product photos with unique, premium Unsplash images
 *
 * Usage: node scripts/update-product-photos.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
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
} catch {
    console.error("Could not read .env.local");
    process.exit(1);
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const U = (id) => `https://images.unsplash.com/${id}?w=600&h=600&fit=crop&q=80`;

// ── Per-product photo mapping (unique, premium product photography) ──

const PRODUCT_PHOTOS = {
    // ─── MODE ───
    "T-shirt col rond":         U("photo-1521572163474-6864f9cf17ab"),
    "Jean 501 Original":        U("photo-1542272604-787c3835535d"),
    "Chemise Oxford slim":      U("photo-1596755094514-f87e34085b2c"),
    "Polo Classic Fit":         U("photo-1626497764746-6dc36546b388"),
    "Sweat à capuche":          U("photo-1556821840-3a63f95609a7"),
    "Veste en jean Trucker":    U("photo-1578587018452-892bacefd3f2"),
    "Robe midi fleurie":        U("photo-1612336307429-8a898d10e223"),
    "Blouse en soie":           U("photo-1564257631407-4deb1f99d992"),
    "Pantalon chino slim":      U("photo-1473966968600-fa801b869a1a"),
    "Pull col V laine mérinos": U("photo-1434389677669-e08b4cda3a14"),
    "Doudoune légère":          U("photo-1591047139829-d91aecb6caea"),
    "Parka imperméable":        U("photo-1544923246-77307dd270ff"),
    "Casquette 9FORTY":         U("photo-1588850561407-ed78c334e67a"),
    "Hoodie Logo":              U("photo-1620799140408-edc6dcb6d633"),
    "Bermuda cargo":            U("photo-1591195853828-11db59a44f6b"),

    // ─── CHAUSSURES ───
    "Air Force 1 '07":          U("photo-1606107557195-0e29a4b5b4aa"),
    "Stan Smith":               U("photo-1520256862855-398228c41684"),
    "574 Classic":              U("photo-1539185441755-769473a23570"),
    "Gel-1130":                 U("photo-1542291026-7eec264c27ff"),
    "Old Skool":                U("photo-1525966222134-fcfa99b8ae77"),
    "Club C 85":                U("photo-1608231387042-66d1773070a5"),
    "Chuck Taylor All Star":    U("photo-1463100099107-aa0980c362e6"),
    "Boots Chelsea cuir":       U("photo-1638247025967-b4e38f787b76"),
    "Sandale compensée":        U("photo-1543163521-1bf539c55dd2"),
    "Mocassin classique":       U("photo-1533867617858-e7b97e060509"),
    "Clifton 9":                U("photo-1542838132-92c53300491e"),
    "Speedcross 6":             U("photo-1603808033192-082d6919d3e1"),
    "Ghost 15":                 U("photo-1595950653106-6c9ebd614d3a"),

    // ─── BIJOUX ───
    "Bracelet Moments":         U("photo-1535632066927-ab7c9ab60908"),
    "Charm Cœur":               U("photo-1599643478518-a784e5dc4c8f"),
    "Collier Tennis":           U("photo-1515562141589-67f0d569b6fc"),
    "Boucles d'oreilles cristal": U("photo-1605100804763-247f67b3557e"),
    "Montre Neutra Chrono":     U("photo-1524592094714-0f0654e20314"),
    "Montre Petite":            U("photo-1523170335258-f5ed11844a49"),
    "Montre Presage":           U("photo-1587836374828-4dbafa94cf0e"),
    "Montre PRX":               U("photo-1548171915-e79a380a2a4b"),
    "G-Shock GA-2100":          U("photo-1614164185128-e4ec99c436d7"),
    "Montre Minuit Mesh":       U("photo-1611591437281-460bfbe1220a"),

    // ─── TECH ───
    "Coque iPhone 15 Pro":      U("photo-1601784551446-20c9e07cdbdb"),
    "Chargeur MagSafe":         U("photo-1618424181497-157f25b6ddd5"),
    "Écouteurs Tune 770NC":     U("photo-1505740420928-5e560c06d30e"),
    "Enceinte Flip 6":          U("photo-1608043152269-423dbba4e7e1"),
    "Galaxy Buds3":             U("photo-1590658268037-6bf12f032f55"),
    "Webcam Brio 4K":           U("photo-1587826080692-f439cd0b70e0"),
    "Clavier MX Keys Mini":     U("photo-1587829741301-dc798b83add3"),
    "Manette DualSense":        U("photo-1606144042614-b2417e99c4e3"),
    "Joy-Con (paire)":          U("photo-1621259182978-fbf93132d53d"),
    "Forerunner 265":           U("photo-1523275335684-37898b6baf30"),
    "Carte microSD 256Go":      U("photo-1531492746076-161ca9bcad09"),

    // ─── BEAUTÉ ───
    "Crème Prodigieuse Boost":  U("photo-1570194065650-d99fb4b38b17"),
    "Eau Micellaire":           U("photo-1556228578-0d85b1a4d571"),
    "Eau Thermale spray 300ml": U("photo-1619451334792-150fd785ee74"),
    "Vinosource-Hydra sérum":   U("photo-1608248543803-ba4f8c70ae0b"),
    "Bougie Baies":             U("photo-1602607537979-282a29a48b49"),
    "Eau de parfum Gypsy Water":U("photo-1541643600914-78b084683601"),
    "Eau de parfum Santal 33":  U("photo-1594035910387-fea081ae7196"),
    "Rose Hand Cream":          U("photo-1571781926291-c477ebfd024b"),
    "Skin Food crème":          U("photo-1612817288484-6f916006741a"),
    "Gel douche Verbena":       U("photo-1596462502278-27bfdc403348"),

    // ─── SPORT ───
    "Ballon de foot Pro":       U("photo-1614632537423-1e6078b78531"),
    "Legging Fly Fast":         U("photo-1506629082955-511b1aa562c8"),
    "Brassière Impact Run":     U("photo-1571019614242-c5c5dee9f50a"),
    "Gants de musculation":     U("photo-1517344884509-a0c97ec11bcc"),
    "Sac à dos Trail 15L":      U("photo-1553062407-98eeb64c6a62"),
    "Tapis de yoga Premium":    U("photo-1592432678016-e910b452f9a2"),
    "Chaussettes compression":  U("photo-1576566588028-4147f3842f27"),
    "Skate deck 8.25":          U("photo-1547447134-cd3f5c716030"),
    "Trucks 149mm":             U("photo-1583115260445-f95fe37202ae"),
    "Casque vélo Aether":       U("photo-1557803175-2f6588e4a3c3"),

    // ─── JOUETS ───
    "Lego Technic Ferrari":     U("photo-1587654780291-39c9404d7dd0"),
    "Lego City Pompiers":       U("photo-1558060370-d644479cb6f7"),
    "Playmobil Maison Modern.": U("photo-1596461404969-9ae70f2830c1"),
    "Puzzle 1000 pièces":       U("photo-1606503153255-59d8b8e0328e"),
    "Jeu Dixit":                U("photo-1566576912321-d58ddd7a6088"),
    "Dobble Classic":           U("photo-1611371805429-8b5c1b2c34ba"),
    "Warhammer Start Set":      U("photo-1612404459571-1dae8fa7d89d"),
    "Jeu Les Aventuriers du Rail": U("photo-1632501641765-e568d28b0015"),
    "Poussette Libelle":        U("photo-1586015555751-63bb77f4322a"),
    "Body coton bio 3-pack":    U("photo-1519689680058-324335c77eba"),

    // ─── ACCESSOIRES ───
    "Lunettes Aviator":         U("photo-1572635196237-14b3f281503f"),
    "Lunettes Frogskins":       U("photo-1511499767150-a48a237f0083"),
    "Sac Le Pliage M":          U("photo-1548036328-c9fa89d128fa"),
    "Portefeuille cuir":        U("photo-1627123424574-724758594e93"),
    "Ceinture réversible":      U("photo-1553062407-98eeb64c6a62"),
    "Sac bandoulière":          U("photo-1590874103328-eac38a683ce7"),
    "Sac à dos Campus":         U("photo-1553062407-98eeb64c6a62"),
    "Lunettes carrées":         U("photo-1577803645773-f96470509666"),
    "Monture optique":          U("photo-1574258495973-f010dfbb5371"),

    // ─── BRICOLAGE ───
    "Perceuse-visseuse 18V":    U("photo-1504148455328-c376907d081c"),
    "Scie sauteuse":            U("photo-1530124566582-a45a7e3d2fda"),
    "Coffret tournevis 40 pcs": U("photo-1581783898377-1c85bf937427"),
    "Mètre laser 30m":         U("photo-1572981779307-38b8cabb2407"),
    "Chevilles universelles x100": U("photo-1586864387789-628af9feed72"),
    "Niveau laser croix":       U("photo-1580901368919-7738efb0f228"),
    "Ponceuse excentrique":     U("photo-1426927308491-6380b6a9936f"),
    "Gants de travail":         U("photo-1621905252507-b35492cc74b4"),
};

async function main() {
    console.log("Fetching all products from Supabase...\n");

    const { data: products, error } = await supabase
        .from("products")
        .select("id, name, photo_url")
        .order("name");

    if (error) {
        console.error("Failed to fetch products:", error);
        process.exit(1);
    }

    console.log(`Found ${products.length} products total.\n`);

    let updated = 0;
    let skipped = 0;
    let notFound = 0;

    for (const product of products) {
        const newUrl = PRODUCT_PHOTOS[product.name];

        if (!newUrl) {
            console.log(`  ? No mapping for: "${product.name}"`);
            notFound++;
            continue;
        }

        if (product.photo_url === newUrl) {
            skipped++;
            continue;
        }

        const { error: updateErr } = await supabase
            .from("products")
            .update({ photo_url: newUrl })
            .eq("id", product.id);

        if (updateErr) {
            console.error(`  ✗ Failed to update "${product.name}":`, updateErr.message);
        } else {
            updated++;
        }
    }

    console.log(`\n─── Summary ───`);
    console.log(`  Updated:   ${updated}`);
    console.log(`  Skipped:   ${skipped} (already correct)`);
    console.log(`  No mapping: ${notFound}`);
    console.log(`\n✅ Product photos updated!\n`);
}

main().catch((err) => {
    console.error("Script failed:", err);
    process.exit(1);
});
