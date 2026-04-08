"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../components/toast";
import type { FollowItem } from "../types";

export function useFollows() {
    return useQuery({
        queryKey: ["follows"],
        queryFn: async (): Promise<FollowItem[]> => {
            const res = await fetch("/api/follows");
            if (res.status === 401) return [];
            if (!res.ok) throw new Error("Failed to fetch follows");
            const data = await res.json();
            return data.follows as FollowItem[];
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
            if (res.status === 401) throw new Error("auth");
            if (!res.ok) throw new Error("Failed to follow");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["follows"] });
            show("Boutique suivie");
        },
        onError: (err) => {
            if (err.message === "auth") show("Connecte-toi pour suivre cette boutique");
        },
    });

    const unfollow = useMutation({
        mutationFn: async (merchantId: string) => {
            const res = await fetch(`/api/follows/${merchantId}`, { method: "DELETE" });
            if (res.status === 401) throw new Error("auth");
            if (!res.ok) throw new Error("Failed to unfollow");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["follows"] });
            show("Boutique retirée");
        },
        onError: (err) => {
            if (err.message === "auth") show("Connecte-toi pour suivre cette boutique");
        },
    });

    return { follow, unfollow };
}
