import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { ToastProvider } from "@/components/dashboard/toast";
import { CelebrationProvider } from "@/providers/celebration-provider";
import { AchievementToast } from "@/components/dashboard/achievement-toast";
import { AchievementModal } from "@/components/dashboard/achievement-modal";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <CelebrationProvider>
            <div className="flex h-screen" style={{ background: "var(--ts-bg-warm)" }}>
                <DashboardSidebar />
                <main className="flex-1 overflow-y-auto px-10 py-8">
                    <ToastProvider>{children}</ToastProvider>
                </main>
            </div>
            <AchievementToast />
            <AchievementModal />
        </CelebrationProvider>
    );
}
