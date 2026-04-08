"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../components/toast";
import type { FavoriteItem } from "../types";

export function useFavorites() {
    return useQuery({
        queryKey: ["favorites"],
        queryFn: async (): Promise<FavoriteItem[]> => {
            const res = await fetch("/api/favorites");
            if (res.status === 401) return [];
            if (!res.ok) throw new Error("Failed to fetch favorites");
            const data = await res.json();
            return data.favorites as FavoriteItem[];
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
            if (res.status === 401) throw new Error("auth");
            if (!res.ok) throw new Error("Failed to add favorite");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["favorites"] });
            show("Ajouté aux favoris");
        },
        onError: (err) => {
            if (err.message === "auth") show("Connecte-toi pour sauvegarder tes favoris");
        },
    });

    const remove = useMutation({
        mutationFn: async (productId: string) => {
            const res = await fetch(`/api/favorites/${productId}`, { method: "DELETE" });
            if (res.status === 401) throw new Error("auth");
            if (!res.ok) throw new Error("Failed to remove favorite");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["favorites"] });
            show("Retiré des favoris");
        },
        onError: (err) => {
            if (err.message === "auth") show("Connecte-toi pour sauvegarder tes favoris");
        },
    });

    return { add, remove };
}
