"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../components/toast";

export function useFollows() {
    return useQuery({
        queryKey: ["follows"],
        queryFn: async () => {
            const res = await fetch("/api/follows");
            if (!res.ok) throw new Error("Failed to fetch follows");
            const data = await res.json();
            return data.follows as Array<{ merchant_id: string; [key: string]: unknown }>;
        },
    });
}

export function useToggleFollow() {
    const queryClient = useQueryClient();
    const { show } = useToast();

    const follow = useMutation({
        mutationFn: async (merchantId: string) => {
            const res = await fetch("/api/follows", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ merchant_id: merchantId }),
            });
            if (!res.ok) throw new Error("Failed to follow");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["follows"] });
            show("Boutique suivie");
        },
    });

    const unfollow = useMutation({
        mutationFn: async (merchantId: string) => {
            const res = await fetch(`/api/follows/${merchantId}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed to unfollow");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["follows"] });
            show("Boutique retirée");
        },
    });

    return { follow, unfollow };
}
