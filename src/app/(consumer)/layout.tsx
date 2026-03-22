import type { Metadata } from "next";
import { QueryProvider } from "./query-provider";
import { TabBar } from "./components/tab-bar";
import { ToastProvider } from "./components/toast";

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
            <ToastProvider>
                <div className="flex min-h-dvh flex-col">
                    <main className="flex-1 pb-16">{children}</main>
                    <TabBar />
                </div>
            </ToastProvider>
        </QueryProvider>
    );
}
