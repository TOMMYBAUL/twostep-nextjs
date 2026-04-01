"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type Category = {
    id: string;
    slug: string;
    label: string;
    emoji: string | null;
    parent_id: string | null;
    parent_slug: string | null;
    sort_order: number;
};

export type CategoryTree = {
    roots: Category[];
    children: Map<string, Category[]>;
};

export function useCategories() {
    return useQuery<CategoryTree>({
        queryKey: ["categories"],
        queryFn: async () => {
            const supabase = createClient();
            const { data, error } = await supabase.rpc("get_categories_tree");
            if (error || !data) return { roots: [], children: new Map() };

            const roots: Category[] = [];
            const children = new Map<string, Category[]>();

            for (const cat of data as Category[]) {
                if (!cat.parent_id) {
                    roots.push(cat);
                } else {
                    const parentSlug = cat.parent_slug ?? "";
                    if (!children.has(parentSlug)) children.set(parentSlug, []);
                    children.get(parentSlug)!.push(cat);
                }
            }

            return { roots, children };
        },
        staleTime: 10 * 60_000,
    });
}
