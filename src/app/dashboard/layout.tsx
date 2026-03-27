import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { BottomTabBar } from "@/components/dashboard/bottom-tab-bar";
import { MobileTopBar } from "@/components/dashboard/mobile-top-bar";
import { TopHeaderBar } from "@/components/dashboard/top-header-bar";
import { ToastProvider } from "@/components/dashboard/toast";
import { CelebrationProvider } from "@/providers/celebration-provider";
import { AchievementToast } from "@/components/dashboard/achievement-toast";
import { AchievementModal } from "@/components/dashboard/achievement-modal";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <CelebrationProvider>
            <div className="flex h-screen" style={{ background: "var(--ts-bg-warm)" }}>
                {/* Sidebar — tablet + desktop only */}
                <DashboardSidebar />

                {/* Main column */}
                <div className="flex flex-1 flex-col overflow-hidden">
                    {/* Mobile top bar */}
                    <MobileTopBar />

                    {/* Desktop top header */}
                    <TopHeaderBar />

                    {/* Content */}
                    <main className="flex-1 overflow-y-auto px-4 py-4 pb-20 md:px-8 md:py-6 md:pb-6 lg:px-10 lg:py-8">
                        <ToastProvider>{children}</ToastProvider>
                    </main>
                </div>
            </div>

            {/* Mobile bottom tab bar */}
            <BottomTabBar />

            {/* Celebration overlays */}
            <AchievementToast />
            <AchievementModal />
        </CelebrationProvider>
    );
}
