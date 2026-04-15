/**
 * Fetch premium product photos from UPCitemdb for seed data screenshots
 * Usage: node scripts/fetch-premium-photos.mjs
 *
 * Searches for real products by name, gets EAN + best photo URL.
 * Output: JSON ready to paste into seed-toulouse.mjs
 */

const RATE_LIMIT_MS = 12000; // UPCitemdb trial: strict rate limit, 12s between requests

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function searchProduct(query) {
    const url = `https://api.upcitemdb.com/prod/trial/search?s=${encodeURIComponent(query)}&type=product`;
    const res = await fetch(url);
    if (!res.ok) {
        console.error(`  FAIL ${res.status} for "${query}"`);
        return null;
    }
    const data = await res.json();
    const item = data.items?.[0];
    if (!item) {
        console.error(`  NO RESULT for "${query}"`);
        return null;
    }
    // Pick best image (prefer large, non-thumbnail)
    const images = item.images || [];
    const bestImage = images.find(u => u.includes("walmart") || u.includes("nordstrom") || u.includes("finishline"))
        || images.find(u => u.includes("500") || u.includes("large") || u.includes("450"))
        || images[0]
        || null;

    return {
        query,
        ean: item.ean,
        title: item.title,
        brand: item.brand,
        image: bestImage,
        imageCount: images.length,
    };
}

// Products to search — diversified across our 8 merchants
const SEARCHES = [
    // Sneakers District (chaussures)
    "Nike Air Force 1 07 white",
    "Adidas Stan Smith white green",
    "New Balance 574 grey",
    "Asics Gel 1130 white",
    "Vans Old Skool black white",
    "Converse Chuck Taylor All Star",

    // Chez Simone (mode femme)
    "Levi's 501 Original jeans women",
    "Ralph Lauren polo shirt",
    "Calvin Klein t-shirt women",

    // Urban Mix (streetwear)
    "The North Face puffer vest",
    "Champion crewneck sweatshirt",
    "Dickies 874 work pants",

    // L'Écrin Doré (bijoux/montres)
    "Casio G-Shock GA-2100",
    "Seiko Presage automatic watch",
    "Daniel Wellington Classic watch",
    "Pandora Moments bracelet silver",

    // Maison Parfu'M (beauté)
    "Nuxe Huile Prodigieuse",
    "La Roche Posay Effaclar",
    "Bioderma Sensibio micellar water",

    // Run & Trail (sport)
    "Hoka Clifton 9 running",
    "Brooks Ghost 15",
    "Garmin Forerunner 265",

    // Maison Pastel (déco)
    "Yankee Candle large jar",
    "Le Creuset mug",

    // Les Canailles (épicerie)
    "Lavazza coffee beans",
    "Monbana hot chocolate",
];

async function main() {
    console.log(`Searching ${SEARCHES.length} products on UPCitemdb...\n`);
    const results = [];

    for (const query of SEARCHES) {
        process.stdout.write(`🔍 "${query}" ... `);
        const result = await searchProduct(query);
        if (result) {
            console.log(`✓ ${result.brand} | ${result.imageCount} images | EAN: ${result.ean}`);
            results.push(result);
        }
        await sleep(RATE_LIMIT_MS);
    }

    console.log(`\n━━━ RESULTS: ${results.length}/${SEARCHES.length} found ━━━\n`);

    for (const r of results) {
        console.log(`${r.brand?.padEnd(20)} | ${r.title?.substring(0, 50).padEnd(52)} | EAN: ${r.ean}`);
        console.log(`${"".padEnd(20)} | ${r.image}`);
        console.log();
    }

    // Write JSON for easy import
    const outputPath = "scripts/premium-photos.json";
    const { writeFileSync } = await import("fs");
    writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\n📁 Saved to ${outputPath}`);
}

main().catch(console.error);
