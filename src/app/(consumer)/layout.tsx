import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { QueryProvider } from "./query-provider";
import { TabBar } from "./components/tab-bar";
import { ToastProvider } from "./components/toast";
import { WelcomeGate } from "./components/welcome-gate";
import { ServiceWorkerRegistration } from "./components/sw-register";


export const metadata: Metadata = {
    title: "Two-Step — Le stock de ton quartier",
    description: "Le produit exact que tu cherches, à deux pas de chez toi.",
};

// Phase de pré-lancement : tant que NEXT_PUBLIC_DISCOVER_LIVE !== "1", toute
// l'app consommateur (discover, explore, pages ville) est masquée derrière la
// page /bientot. Évite qu'un prospect démarché tombe sur des vitrines fictives.
// Pour ouvrir l'app au public : poser NEXT_PUBLIC_DISCOVER_LIVE=1.
export default function ConsumerLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    if (process.env.NEXT_PUBLIC_DISCOVER_LIVE !== "1") {
        redirect("/bientot");
    }

    return (
        <QueryProvider>
            <ToastProvider>
                <div className="flex min-h-dvh flex-col">
                    <main id="main-content" className="flex-1 pb-20">{children}</main>
                    <TabBar />
                </div>
                <WelcomeGate />
                <ServiceWorkerRegistration />
            </ToastProvider>
        </QueryProvider>
    );
}
