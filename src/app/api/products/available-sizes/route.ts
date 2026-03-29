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

        // Read from available_sizes JSONB column (the real source of truth)
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
                const num = parseFloat(s);
                if (!isNaN(num) && num >= 35 && num <= 48) {
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
