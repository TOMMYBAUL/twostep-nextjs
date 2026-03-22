"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../components/toast";

export function useFavorites() {
    return useQuery({
        queryKey: ["favorites"],
        queryFn: async () => {
            const res = await fetch("/api/favorites");
            if (!res.ok) throw new Error("Failed to fetch favorites");
            const data = await res.json();
            return data.favorites as Array<{ product_id: string; [key: string]: unknown }>;
        },
    });
}

export function useToggleFavorite() {
    const queryClient = useQueryClient();
    const { show } = useToast();

    const add = useMutation({
        mutationFn: async (productId: string) => {
            const res = await fetch("/api/favorites", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ product_id: productId }),
            });
            if (!res.ok) throw new Error("Failed to add favorite");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["favorites"] });
            show("Ajouté aux favoris");
        },
    });

    const remove = useMutation({
        mutationFn: async (productId: string) => {
            const res = await fetch(`/api/favorites/${productId}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed to remove favorite");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["favorites"] });
            show("Retiré des favoris");
        },
    });

    return { add, remove };
}
