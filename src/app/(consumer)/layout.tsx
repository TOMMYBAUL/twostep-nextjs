import type { Metadata } from "next";
import { QueryProvider } from "./query-provider";
import { TabBar } from "./components/tab-bar";

export const metadata: Metadata = {
    title: "Two-Step — Découvrez le stock local",
    description: "Le produit exact que tu cherches, à deux pas de chez toi.",
};

export default function ConsumerLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <QueryProvider>
            <div className="flex min-h-dvh flex-col">
                <main className="flex-1 pb-16">{children}</main>
                <TabBar />
            </div>
        </QueryProvider>
    );
}
