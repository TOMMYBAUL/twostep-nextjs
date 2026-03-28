import { createClient } from "@supabase/supabase-js";

const CLOTHING_REGEX = /(?:^|[\s—–\-\/,()]+|(?:taille|size|t\.)\s*)(?<size>XXS|XS|XXL|XXXL|XL|S|M|L)(?:\s*$|[\s—–\-\/,()]+|$)/i;
const SHOE_REGEX = /(?:^|[\s—–\-\/,()]+|(?:taille|size|t\.)\s*)(?<size>(?:3[5-9]|4[0-8])(?:\.5)?)(?:\s*$|[\s—–\-\/,()]+|$)/;

function extractSize(name: string): string | null {
    if (!name) return null;
    const shoeMatch = name.match(SHOE_REGEX);
    if (shoeMatch?.groups?.size) return shoeMatch.groups.size;
    const clothingMatch = name.match(CLOTHING_REGEX);
    if (clothingMatch?.groups?.size) return clothingMatch.groups.size.toUpperCase();
    return null;
}

async function main() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: products, error } = await supabase
        .from("products")
        .select("id, name")
        .is("size", null);

    if (error) { console.error(error); process.exit(1); }

    let updated = 0;
    for (const p of products ?? []) {
        const size = extractSize(p.name);
        if (size) {
            await supabase.from("products").update({ size }).eq("id", p.id);
            updated++;
            console.log(`  ${p.name} → ${size}`);
        }
    }

    console.log(`\nDone: ${updated}/${(products ?? []).length} products updated with size.`);
}

main();
