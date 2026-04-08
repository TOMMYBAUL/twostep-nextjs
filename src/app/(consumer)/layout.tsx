import type { Metadata } from "next";
import { QueryProvider } from "./query-provider";
import { TabBar } from "./components/tab-bar";
import { ToastProvider } from "./components/toast";
import { WelcomeGate } from "./components/welcome-gate";
import { ServiceWorkerRegistration } from "./components/sw-register";


export const metadata: Metadata = {
    title: "Two-Step — Le stock de ton quartier",
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
                    <main id="main-content" className="flex-1 pb-20">{children}</main>
                    <TabBar />
                </div>
                <WelcomeGate />
                <ServiceWorkerRegistration />
            </ToastProvider>
        </QueryProvider>
    );
}
