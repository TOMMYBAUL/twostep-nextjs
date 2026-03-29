import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const revalidate = 300; // cache 5 min

export async function GET() {
    try {
        const supabase = createAdminClient();

        const { data, error } = await supabase
            .from("products")
            .select("size")
            .not("size", "is", null)
            .limit(5000);

        if (error) {
            return NextResponse.json({ clothing: [], shoe: [] });
        }

        const clothing = new Set<string>();
        const shoe = new Set<number>();

        for (const row of data) {
            const s = row.size as string;
            const num = parseFloat(s);
            if (!isNaN(num) && num >= 35 && num <= 48) {
                shoe.add(num);
            } else if (/^(XXS|XS|S|M|L|XL|XXL|XXXL)$/i.test(s)) {
                clothing.add(s.toUpperCase());
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
