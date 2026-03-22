"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

interface SearchResult {
    product_id: string;
    product_name: string;
    product_price: number;
    product_photo: string | null;
    product_ean: string | null;
    stock_quantity: number;
    merchant_id: string;
    merchant_name: string;
    merchant_address: string;
    merchant_city: string;
    distance_km: number;
    sale_price: number | null;
    sale_ends_at: string | null;
}

interface AutocompleteSuggestion {
    suggestion: string;
    suggestion_type: "product" | "brand" | "category";
}

export function useSearch(query: string, lat: number, lng: number, radius = 5) {
    const [debouncedQuery, setDebouncedQuery] = useState(query);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(query), 300);
        return () => clearTimeout(timer);
    }, [query]);

    return useQuery<SearchResult[]>({
        queryKey: ["search", debouncedQuery, lat, lng, radius],
        queryFn: async () => {
            const params = new URLSearchParams({
                q: debouncedQuery,
                lat: lat.toString(),
                lng: lng.toString(),
                radius: radius.toString(),
            });
            const res = await fetch(`/api/search?${params}`);
            if (!res.ok) throw new Error("Search failed");
            const data = await res.json();
            return data.results;
        },
        enabled: debouncedQuery.length >= 2,
    });
}

export function useAutocomplete(query: string) {
    const [debouncedQuery, setDebouncedQuery] = useState(query);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(query), 200);
        return () => clearTimeout(timer);
    }, [query]);

    return useQuery<AutocompleteSuggestion[]>({
        queryKey: ["autocomplete", debouncedQuery],
        queryFn: async () => {
            const res = await fetch(`/api/autocomplete?q=${encodeURIComponent(debouncedQuery)}`);
            if (!res.ok) throw new Error("Autocomplete failed");
            const data = await res.json();
            return data.suggestions;
        },
        enabled: debouncedQuery.length >= 2,
    });
}
