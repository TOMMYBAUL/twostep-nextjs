"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

type FilterValue = { tag_type: string; tag_value: string; count: number };

export function useFilterValues(categorySlug: string | null, lat: number, lng: number) {
    return useQuery<FilterValue[]>({
        queryKey: ["filter-values", categorySlug, lat, lng],
        queryFn: async () => {
            if (!categorySlug) return [];
            const supabase = createClient();
            const { data, error } = await supabase.rpc("get_filter_values", {
                p_category_slug: categorySlug,
                p_lat: lat,
                p_lng: lng,
                p_radius_km: 10,
            });
            if (error || !data) return [];
            return data as FilterValue[];
        },
        staleTime: 30_000,
        enabled: !!categorySlug,
    });
}
