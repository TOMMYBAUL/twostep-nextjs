import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const revalidate = 300; // cache 5 min

interface SizeEntry {
    size: string;
    quantity?: number;
}

export async function GET() {
    try {
        const supabase = createAdminClient();

        const { data, error } = await supabase
            .from("products")
            .select("available_sizes")
            .not("available_sizes", "eq", "[]")
            .eq("visible", true)
            .limit(5000);

        if (error) {
            return NextResponse.json({ clothing: [], shoe: [] });
        }

        const clothing = new Set<string>();
        const shoe = new Set<number>();

        for (const row of data) {
            const sizes = row.available_sizes as SizeEntry[] | null;
            if (!Array.isArray(sizes)) continue;
            for (const entry of sizes) {
                const s = typeof entry === "string" ? entry : entry.size;
                if (!s) continue;
                // Only include sizes that have stock > 0
                const qty = typeof entry === "object" ? (entry.quantity ?? 0) : 0;
                if (qty <= 0) continue;

                const num = parseFloat(s);
                if (!isNaN(num)) {
                    // Any numeric size (pointure, taille enfant, etc.)
                    shoe.add(num);
                } else if (/^(XXS|XS|S|M|L|XL|XXL|XXXL)$/i.test(s)) {
                    clothing.add(s.toUpperCase());
                }
            }
        }

        const clothingOrder = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];
        const sortedClothing = [...clothing].sort((a, b) => clothingOrder.indexOf(a) - clothingOrder.indexOf(b));
        const sortedShoe = [...shoe].sort((a, b) => a - b);

        return NextResponse.json({ clothing: sortedClothing, shoe: sortedShoe });
    } catch {
        return NextResponse.json({ clothing: [], shoe: [] });
    }
}
