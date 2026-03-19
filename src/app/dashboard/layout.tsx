import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { ToastProvider } from "@/components/dashboard/toast";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-screen" style={{ background: "var(--ts-bg-warm)" }}>
            <DashboardSidebar />
            <main className="flex-1 overflow-y-auto px-10 py-8">
                <ToastProvider>{children}</ToastProvider>
            </main>
        </div>
    );
}
